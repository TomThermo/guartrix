import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerType } from "@guartrix/shared";
import { addonKindFor } from "@guartrix/shared";
import { safeExtractArchive } from "@guartrix/node-agent";
import { createBackup } from "../backups.js";
import { serverDir } from "../../config.js";
import { prisma } from "../../db.js";
import { syncLocalDirToNode } from "../server-files.js";
import { LOADER_CATEGORY_NAMES } from "../addons-modrinth.js";
import {
  assertStopped,
  downloadToFile,
  fetchJson,
  loaderFacet,
  MODPACK_SORT,
  type ModpackSortIndex,
} from "./shared.js";

export async function searchModrinthModpacks(opts: {
  type: ServerType;
  mcVersion: string;
  query?: string;
  category?: string;
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
  const index: ModpackSortIndex = MODPACK_SORT.includes(opts.index as ModpackSortIndex)
    ? (opts.index as ModpackSortIndex)
    : "relevance";
  const category = opts.category?.trim() || "";
  const categoryFacet =
    category && !LOADER_CATEGORY_NAMES.has(category) ? [`categories:${category}`] : null;
  // Prefer version-matched packs; fall back without version so the tab is never empty.
  const facetAttempts: string[][][] = [
    [
      loaders.map((l) => `categories:${l}`),
      [`versions:${opts.mcVersion}`],
      ["project_type:modpack"],
      ...(categoryFacet ? [categoryFacet] : []),
    ],
    [
      loaders.map((l) => `categories:${l}`),
      ["project_type:modpack"],
      ...(categoryFacet ? [categoryFacet] : []),
    ],
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
      // With a category filter, empty is a valid result — don't fall through
      // and drop the category (would surprise the user).
      if (data.hits.length > 0 || categoryFacet || facets.length < 3) {
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
  let version: ModrinthVersion | undefined;

  if (opts.versionId?.trim()) {
    try {
      version = await fetchJson<ModrinthVersion>(
        `https://api.modrinth.com/v2/version/${encodeURIComponent(opts.versionId.trim())}`,
      );
    } catch {
      version = undefined;
    }
  }

  if (!version) {
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

    version = versions.find((v) => v.game_versions.includes(server.mcVersion)) ?? versions[0];
  }
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
    await safeExtractArchive(mrpackPath, extractDir);

    const indexRaw = await fs.readFile(path.join(extractDir, "modrinth.index.json"), "utf8");
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
