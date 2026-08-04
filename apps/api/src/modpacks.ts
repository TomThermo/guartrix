import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerType } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import { createBackup } from "./backups.js";
import { serverDir } from "./config.js";
import { prisma } from "./db.js";
import { processManager } from "./process-manager.js";
import { syncLocalDirToNode } from "./server-files.js";

const execFileAsync = promisify(execFile);

const MODRINTH_TIMEOUT_MS = 30_000;

function modrinthUa(): string {
  const base =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.PUBLIC_HOST?.trim() ||
    "https://guartrix.com";
  return `Guartrix/1.0 (${base}; admin@guartrix.com)`;
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": modrinthUa(), ...headers },
    signal: AbortSignal.timeout(MODRINTH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function assertStopped(serverId: string, status: string): void {
  if (
    processManager.isRunning(serverId) ||
    status === "RUNNING" ||
    status === "STARTING" ||
    status === "STOPPING"
  ) {
    throw new Error("Stop the server before installing a modpack");
  }
}

function loaderFacet(type: ServerType): string[] {
  switch (type) {
    case "FABRIC":
      return ["fabric"];
    case "QUILT":
      return ["quilt", "fabric"];
    case "FORGE":
      return ["forge"];
    case "NEOFORGE":
      return ["neoforge"];
    default:
      return [];
  }
}

const MODPACK_SORT = [
  "relevance",
  "downloads",
  "follows",
  "newest",
  "updated",
] as const;
type ModpackSortIndex = (typeof MODPACK_SORT)[number];

export async function searchModrinthModpacks(opts: {
  type: ServerType;
  mcVersion: string;
  query?: string;
  index?: string;
  offset?: number;
  limit?: number;
}): Promise<{ hits: Array<Record<string, unknown>>; totalHits: number }> {
  const loaders = loaderFacet(opts.type);
  if (!loaders.length) {
    throw new Error("Modpacks are only available for Fabric/Quilt/Forge/NeoForge");
  }
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const index: ModpackSortIndex = MODPACK_SORT.includes(
    opts.index as ModpackSortIndex,
  )
    ? (opts.index as ModpackSortIndex)
    : "relevance";
  // Prefer version-matched packs; fall back without version so the tab is never empty.
  const facetAttempts: string[][][] = [
    [
      loaders.map((l) => `categories:${l}`),
      [`versions:${opts.mcVersion}`],
      ["project_type:modpack"],
    ],
    [loaders.map((l) => `categories:${l}`), ["project_type:modpack"]],
  ];
  // Empty string browses the catalog (Modrinth returns 0 for query=" ").
  const query = (opts.query ?? "").trim();

  let lastError: Error | null = null;
  for (const facets of facetAttempts) {
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      offset: String(offset),
      index,
      facets: JSON.stringify(facets),
    });
    try {
      const data = await fetchJson<{
        hits: Array<Record<string, unknown>>;
        total_hits: number;
      }>(`https://api.modrinth.com/v2/search?${params}`);
      if (data.hits.length > 0 || facets.length < 3) {
        return { hits: data.hits, totalHits: data.total_hits };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (lastError) throw lastError;
  return { hits: [], totalHits: 0 };
}

type MrpackIndex = {
  game?: string;
  versionId?: string;
  name?: string;
  files: Array<{
    path: string;
    downloads: string[];
    fileSize?: number;
    env?: { client?: string; server?: string };
  }>;
  dependencies?: Record<string, string>;
};

async function downloadToFile(url: string, dest: string): Promise<void> {
  const { fetchSafeDownload } = await import("./safe-url.js");
  const res = await fetchSafeDownload(url, {
    headers: { "User-Agent": modrinthUa() },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

/**
 * Install a Modrinth modpack (.mrpack) into an existing server.
 * Keeps world; installs server-side pack files into mods/overrides.
 */
export async function installModrinthModpack(opts: {
  serverId: string;
  projectId: string;
  versionId?: string;
}): Promise<{ title: string; versionNumber: string; filesInstalled: number }> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: opts.serverId } });
  assertStopped(server.id, server.status);
  if (!addonKindFor(server.type as ServerType)) {
    throw new Error("This server type does not support modpacks");
  }
  if (!loaderFacet(server.type as ServerType).length) {
    throw new Error("Modpacks require a mod loader (Fabric/Quilt/Forge/NeoForge)");
  }

  if (!server.nodeId) throw new Error("Server has no node assigned");
  await createBackup({
    serverId: server.id,
    trigger: "manual",
    note: `Pre-modpack ${opts.projectId}`,
  });

  type ModrinthVersion = {
    id: string;
    version_number: string;
    name: string;
    game_versions: string[];
    loaders: string[];
    files: Array<{
      url: string;
      filename: string;
      primary: boolean;
      size: number;
    }>;
  };

  const loaders = loaderFacet(server.type as ServerType);
  const params = new URLSearchParams();
  for (const l of loaders) params.append("loaders", JSON.stringify([l]));
  params.append("game_versions", JSON.stringify([server.mcVersion]));

  let versions = await fetchJson<ModrinthVersion[]>(
    `https://api.modrinth.com/v2/project/${encodeURIComponent(opts.projectId)}/version?${params}`,
  );
  if (!versions.length) {
    versions = await fetchJson<ModrinthVersion[]>(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(opts.projectId)}/version`,
    );
  }

  const version =
    (opts.versionId
      ? versions.find((v) => v.id === opts.versionId)
      : versions.find((v) => v.game_versions.includes(server.mcVersion))) ??
    versions[0];
  if (!version) throw new Error("No compatible modpack version found");

  const file =
    version.files.find((f) => f.primary) ??
    version.files.find((f) => f.filename.endsWith(".mrpack")) ??
    version.files[0];
  if (!file) throw new Error("Modpack has no downloadable file");

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-mrpack-${server.id}-`));
  const mrpackPath = path.join(tmpRoot, file.filename);
  const extractDir = path.join(tmpRoot, "extract");
  const stageDir = path.join(tmpRoot, "stage");
  await fs.mkdir(extractDir, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });

  try {
    await downloadToFile(file.url, mrpackPath);
    await execFileAsync("unzip", ["-q", "-o", mrpackPath, "-d", extractDir], {
      maxBuffer: 32 * 1024 * 1024,
    });

    const indexRaw = await fs.readFile(
      path.join(extractDir, "modrinth.index.json"),
      "utf8",
    );
    const index = JSON.parse(indexRaw) as MrpackIndex;
    let installed = 0;

    for (const entry of index.files ?? []) {
      const serverEnv = entry.env?.server ?? "required";
      if (serverEnv === "unsupported") continue;
      const destRel = entry.path.replace(/^\/+/, "");
      if (destRel.includes("..")) continue;
      const url = entry.downloads?.[0];
      if (!url) continue;
      const dest = path.join(stageDir, destRel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await downloadToFile(url, dest);
      installed++;
    }

    // Copy overrides (server + generic)
    for (const overrideName of ["overrides", "server-overrides"]) {
      const src = path.join(extractDir, overrideName);
      try {
        await fs.access(src);
        await fs.cp(src, stageDir, { recursive: true });
      } catch {
        /* none */
      }
    }

    await syncLocalDirToNode(server.id, server.nodeId, stageDir);

    // Also mirror into local serverDir when local node for addon listing consistency
    try {
      await fs.cp(stageDir, serverDir(server.id), { recursive: true });
    } catch {
      /* remote-only */
    }

    return {
      title: index.name || version.name,
      versionNumber: version.version_number,
      filesInstalled: installed,
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

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
    (opts.fileId
      ? filesResp.data.find((f) => f.id === opts.fileId)
      : undefined) ??
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
    throw new Error(
      "No downloadable CurseForge server pack found for this project/version",
    );
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-cf-${server.id}-`));
  const archivePath = path.join(tmpRoot, file.fileName || "pack.zip");
  const extractDir = path.join(tmpRoot, "extract");
  const stageDir = path.join(tmpRoot, "stage");
  await fs.mkdir(extractDir, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });

  try {
    await downloadToFile(file.downloadUrl, archivePath);
    const lower = archivePath.toLowerCase();
    if (lower.endsWith(".zip")) {
      await execFileAsync("unzip", ["-q", "-o", archivePath, "-d", extractDir], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } else {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir], {
        maxBuffer: 64 * 1024 * 1024,
      });
    }

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
