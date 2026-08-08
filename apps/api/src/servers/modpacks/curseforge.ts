import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerType } from "@msm/shared";
import { safeExtractArchive } from "@msm/node-agent";
import { createBackup } from "../backups.js";
import { serverDir } from "../../config.js";
import { prisma } from "../../db.js";
import { syncLocalDirToNode } from "../server-files.js";
import { assertStopped, downloadToFile, fetchJson, loaderFacet } from "./shared.js";

/** CurseForge search + install (requires CURSEFORGE_API_KEY). */
export function curseforgeConfigured(): boolean {
  return Boolean(process.env.CURSEFORGE_API_KEY?.trim());
}

export async function searchCurseforgeModpacks(opts: {
  type: ServerType;
  mcVersion: string;
  query?: string;
  offset?: number;
  limit?: number;
}): Promise<{ hits: Array<Record<string, unknown>>; totalHits: number; configured: boolean }> {
  if (!curseforgeConfigured()) {
    return { hits: [], totalHits: 0, configured: false };
  }
  const loaders = loaderFacet(opts.type);
  if (!loaders.length) {
    throw new Error("Modpacks are only available for Fabric/Quilt/Forge/NeoForge");
  }
  const key = process.env.CURSEFORGE_API_KEY!.trim();
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const params = new URLSearchParams({
    gameId: "432",
    classId: "4471", // modpacks
    searchFilter: (opts.query ?? "").trim(),
    pageSize: String(limit),
    index: String(offset),
    sortField: "2",
    sortOrder: "desc",
    gameVersion: opts.mcVersion,
  });
  // ModLoaderType: 1=Forge 4=Fabric 5=Quilt 6=NeoForge
  const loaderMap: Record<string, string> = {
    forge: "1",
    fabric: "4",
    quilt: "5",
    neoforge: "6",
  };
  const ml = loaderMap[loaders[0]!];
  if (ml) params.set("modLoaderType", ml);

  const data = await fetchJson<{
    data: Array<Record<string, unknown>>;
    pagination: { totalCount: number };
  }>(`https://api.curseforge.com/v1/mods/search?${params}`, {
    "x-api-key": key,
  });
  return {
    hits: data.data,
    totalHits: data.pagination?.totalCount ?? data.data.length,
    configured: true,
  };
}

/**
 * Install CurseForge modpack via server-pack file download when available.
 * Falls back to error if no server pack file exists.
 */
export async function installCurseforgeModpack(opts: {
  serverId: string;
  modId: number;
  fileId?: number;
}): Promise<{ title: string; versionNumber: string; filesInstalled: number }> {
  if (!curseforgeConfigured()) {
    throw new Error("CurseForge is not configured (set CURSEFORGE_API_KEY)");
  }
  const server = await prisma.server.findUniqueOrThrow({ where: { id: opts.serverId } });
  assertStopped(server.id, server.status);
  if (!server.nodeId) throw new Error("Server has no node assigned");
  const key = process.env.CURSEFORGE_API_KEY!.trim();

  await createBackup({
    serverId: server.id,
    trigger: "manual",
    note: `Pre-curseforge-modpack ${opts.modId}`,
  });

  const mod = await fetchJson<{ data: { id: number; name: string } }>(
    `https://api.curseforge.com/v1/mods/${opts.modId}`,
    { "x-api-key": key },
  );

  const filesResp = await fetchJson<{
    data: Array<{
      id: number;
      displayName: string;
      fileName: string;
      downloadUrl: string | null;
      isServerPack?: boolean;
      serverPackFileId?: number | null;
      gameVersions: string[];
    }>;
  }>(`https://api.curseforge.com/v1/mods/${opts.modId}/files?pageSize=50`, {
    "x-api-key": key,
  });

  let file =
    (opts.fileId ? filesResp.data.find((f) => f.id === opts.fileId) : undefined) ??
    filesResp.data.find(
      (f) =>
        f.isServerPack &&
        f.gameVersions.some((v) => v === server.mcVersion || v.includes(server.mcVersion)),
    ) ??
    filesResp.data.find((f) => f.gameVersions.includes(server.mcVersion)) ??
    filesResp.data[0];

  if (file?.serverPackFileId && !file.isServerPack) {
    const pack = filesResp.data.find((f) => f.id === file!.serverPackFileId);
    if (pack) file = pack;
    else {
      const one = await fetchJson<{ data: typeof file }>(
        `https://api.curseforge.com/v1/mods/${opts.modId}/files/${file.serverPackFileId}`,
        { "x-api-key": key },
      );
      file = one.data;
    }
  }

  if (!file?.downloadUrl) {
    throw new Error("No downloadable CurseForge server pack found for this project/version");
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-cf-${server.id}-`));
  const archivePath = path.join(tmpRoot, file.fileName || "pack.zip");
  const extractDir = path.join(tmpRoot, "extract");
  const stageDir = path.join(tmpRoot, "stage");
  await fs.mkdir(extractDir, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });

  try {
    await downloadToFile(file.downloadUrl, archivePath);
    await safeExtractArchive(archivePath, extractDir);

    // Prefer contents that look like a Minecraft server root
    async function findRoot(dir: string, depth: number): Promise<string> {
      if (depth > 3) return dir;
      const names = await fs.readdir(dir);
      if (names.includes("mods") || names.includes("config") || names.includes("libraries")) {
        return dir;
      }
      for (const n of names) {
        const full = path.join(dir, n);
        const st = await fs.stat(full);
        if (st.isDirectory()) {
          const found = await findRoot(full, depth + 1);
          if (found !== full || names.includes("mods")) return found;
        }
      }
      return dir;
    }

    const root = await findRoot(extractDir, 0);
    // Copy everything except client-only noise when obvious
    await fs.cp(root, stageDir, { recursive: true });
    await syncLocalDirToNode(server.id, server.nodeId, stageDir);
    try {
      await fs.cp(stageDir, serverDir(server.id), { recursive: true });
    } catch {
      /* remote */
    }

    const names = await fs.readdir(stageDir);
    return {
      title: mod.data.name,
      versionNumber: file.displayName || file.fileName,
      filesInstalled: names.length,
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
