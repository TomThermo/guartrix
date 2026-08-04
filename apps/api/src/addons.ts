import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AddonCategory,
  AddonKind,
  AddonSortIndex,
  AddonSearchHit,
  AddonSyncResult,
  InstalledAddonUpdate,
  ServerType,
} from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import type { AddonVersionInfo, ModrinthVersion } from "./addons-modrinth.js";
import {
  LOADER_CATEGORY_NAMES,
  MODRINTH_MAX_ATTEMPTS,
  MODRINTH_TIMEOUT_MS,
  categoryLabel,
  fetchJson,
  loadersFor,
  mapVersion,
  modrinthUserAgent,
  pickVersion,
} from "./addons-modrinth.js";

const execFileAsync = promisify(execFile);

export type { AddonKind, AddonVersionInfo };

export interface InstalledAddon {
  source: "modrinth" | "local";
  kind: AddonKind;
  projectId: string;
  slug: string;
  title: string;
  versionId: string;
  versionNumber: string;
  fileName: string;
  gameVersions: string[];
  installedAt: string;
  iconUrl?: string | null;
  description?: string | null;
  author?: string | null;
  categories?: string[];
}

export type { AddonSyncResult, InstalledAddonUpdate };

export interface AddonInstallResult {
  installed: InstalledAddon;
  dependenciesInstalled: InstalledAddon[];
  alreadyPresent: InstalledAddon[];
  restartRequired: true;
}

interface Manifest {
  addons: InstalledAddon[];
}

function kindFor(type: ServerType): AddonKind | null {
  return addonKindFor(type);
}

export function addonDir(serverDir: string, type: ServerType): string | null {
  if (type === "PAPER" || type === "PURPUR") return path.join(serverDir, "plugins");
  if (
    type === "FABRIC" ||
    type === "QUILT" ||
    type === "FORGE" ||
    type === "NEOFORGE"
  ) {
    return path.join(serverDir, "mods");
  }
  return null;
}

function manifestPath(serverDir: string): string {
  return path.join(serverDir, "guartrix-addons.json");
}

/** Run async tasks with a max concurrency (keeps Modrinth happy). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function readManifest(serverDir: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath(serverDir), "utf8");
    const data = JSON.parse(raw) as Manifest;
    return { addons: Array.isArray(data.addons) ? data.addons : [] };
  } catch {
    return { addons: [] };
  }
}

async function writeManifest(serverDir: string, manifest: Manifest): Promise<void> {
  await fs.writeFile(
    manifestPath(serverDir),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

export async function listAddonCategories(type: ServerType): Promise<AddonCategory[]> {
  const kind = kindFor(type);
  if (!kind) return [];

  const tags = await fetchJson<{ name: string; project_type: string; header: string }[]>(
    "https://api.modrinth.com/v2/tag/category",
  );

  // Plugins on Modrinth reuse the same category names as mods.
  const filtered = tags.filter(
    (t) =>
      t.project_type === "mod" &&
      t.header === "categories" &&
      !LOADER_CATEGORY_NAMES.has(t.name),
  );

  const seen = new Set<string>();
  const out: AddonCategory[] = [];
  for (const tag of filtered) {
    if (seen.has(tag.name)) continue;
    seen.add(tag.name);
    out.push({ name: tag.name, label: categoryLabel(tag.name) });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function listInstalledAddons(serverDir: string): Promise<InstalledAddon[]> {
  const manifest = await readManifest(serverDir);
  const kept: InstalledAddon[] = [];
  let mutated = false;

  for (const addon of manifest.addons) {
    const dir =
      addon.kind === "plugin"
        ? path.join(serverDir, "plugins")
        : path.join(serverDir, "mods");
    try {
      await fs.access(path.join(dir, addon.fileName));
    } catch {
      mutated = true;
      continue;
    }

    let next = addon;
    if (!addon.iconUrl) {
      try {
        const project = await fetchJson<{
          id: string;
          slug: string;
          title: string;
          description?: string;
          icon_url?: string | null;
          categories?: string[];
        }>(`https://api.modrinth.com/v2/project/${addon.projectId}`);
        let author: string | null = addon.author ?? null;
        try {
          const members = await fetchJson<{ user: { username: string }; role: string }[]>(
            `https://api.modrinth.com/v2/project/${addon.projectId}/members`,
          );
          const owner =
            members.find((m) => m.role.toLowerCase() === "owner") ?? members[0];
          author = owner?.user.username ?? author;
        } catch {
          // ignore
        }
        next = {
          ...addon,
          slug: project.slug || addon.slug,
          title: project.title || addon.title,
          iconUrl: project.icon_url ?? null,
          description: project.description ?? addon.description ?? null,
          author,
          categories: project.categories ?? addon.categories ?? [],
        };
        mutated = true;
      } catch {
        // keep as-is if Modrinth is unreachable
      }
    }
    kept.push(next);
  }

  if (mutated || kept.length !== manifest.addons.length) {
    await writeManifest(serverDir, { addons: kept });
  }
  return kept;
}

export async function searchAddons(
  type: ServerType,
  mcVersion: string,
  opts: {
    query?: string;
    category?: string;
    index?: AddonSortIndex;
    offset?: number;
    limit?: number;
  } = {},
): Promise<{ hits: AddonSearchHit[]; totalHits: number; offset: number; limit: number }> {
  const kind = kindFor(type);
  const loaders = loadersFor(type);
  if (!kind || !loaders.length) {
    throw new Error(
      "Addons are only available for Paper/Purpur (plugins) and Fabric/Quilt/Forge/NeoForge (mods)",
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const index: AddonSortIndex = opts.index ?? "relevance";
  const category = opts.category?.trim() || "";

  const projectTypeFacet =
    kind === "plugin"
      ? ["project_type:plugin", "project_type:mod"]
      : ["project_type:mod"];
  const categoryFacet =
    category && !LOADER_CATEGORY_NAMES.has(category)
      ? [`categories:${category}`]
      : null;

  // Full facets first; Modrinth/Meilisearch sometimes 500s on the combined
  // server_side + versions filter — fall back to a simpler query.
  const facetAttempts: string[][][] = [
    [
      loaders.map((l) => `categories:${l}`),
      [`versions:${mcVersion}`],
      ["server_side:required", "server_side:optional"],
      projectTypeFacet,
      ...(categoryFacet ? [categoryFacet] : []),
    ],
    [
      loaders.map((l) => `categories:${l}`),
      [`versions:${mcVersion}`],
      projectTypeFacet,
      ...(categoryFacet ? [categoryFacet] : []),
    ],
    [
      loaders.map((l) => `categories:${l}`),
      projectTypeFacet,
      ...(categoryFacet ? [categoryFacet] : []),
    ],
  ];

  // Empty string browses the catalog. A lone space used to be a workaround but
  // Modrinth now returns 0 hits for query=" " (see modrinth.com search).
  const query = (opts.query ?? "").trim();
  type SearchPayload = {
    hits: {
      project_id: string;
      slug: string;
      title: string;
      description: string;
      icon_url?: string;
      downloads: number;
      follows: number;
      author: string;
      categories: string[];
    }[];
    total_hits: number;
  };

  let data: SearchPayload | null = null;
  let lastError: Error | null = null;
  for (let i = 0; i < facetAttempts.length; i++) {
    const facetList = facetAttempts[i]!;
    const params = new URLSearchParams({
      query,
      limit: String(limit),
      offset: String(offset),
      index,
      facets: JSON.stringify(facetList),
    });
    try {
      data = await fetchJson<SearchPayload>(
        `https://api.modrinth.com/v2/search?${params}`,
        // First facet set gets a retry; fallbacks are single-shot to stay snappy.
        { retries: i === 0 ? MODRINTH_MAX_ATTEMPTS : 1 },
      );
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const retryable =
        msg.includes("temporarily unavailable") ||
        msg.includes("timed out") ||
        msg.includes("unreachable") ||
        msg.includes("rate limit");
      if (!retryable) throw lastError;
    }
  }
  if (!data) {
    throw lastError ?? new Error("Modrinth search failed");
  }

  return {
    offset,
    limit,
    totalHits: data.total_hits,
    hits: data.hits.map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      iconUrl: h.icon_url ?? null,
      downloads: h.downloads,
      follows: h.follows,
      author: h.author,
      categories: h.categories.filter((c) => !LOADER_CATEGORY_NAMES.has(c)),
    })),
  };
}

export async function listCompatibleVersions(
  type: ServerType,
  mcVersion: string,
  projectIdOrSlug: string,
): Promise<AddonVersionInfo[]> {
  const loaders = loadersFor(type);
  if (!loaders.length) return [];

  const params = new URLSearchParams({
    loaders: JSON.stringify(loaders),
    game_versions: JSON.stringify([mcVersion]),
  });

  const versions = await fetchJson<ModrinthVersion[]>(
    `https://api.modrinth.com/v2/project/${projectIdOrSlug}/version?${params}`,
  );

  return versions.map(mapVersion).filter((v): v is AddonVersionInfo => v !== null);
}

/**
 * All Modrinth versions for this loader (any game version). Used by the install /
 * change-version picker so the user can switch Minecraft versions in the UI.
 */
export async function listLoaderAddonVersions(
  type: ServerType,
  projectIdOrSlug: string,
): Promise<{ versions: AddonVersionInfo[]; gameVersions: string[] }> {
  const loaders = loadersFor(type);
  if (!loaders.length) return { versions: [], gameVersions: [] };

  const params = new URLSearchParams({
    loaders: JSON.stringify(loaders),
  });

  const versions = await fetchJson<ModrinthVersion[]>(
    `https://api.modrinth.com/v2/project/${projectIdOrSlug}/version?${params}`,
  );

  const mapped = versions
    .map(mapVersion)
    .filter((v): v is AddonVersionInfo => v !== null);

  const gameVersions: string[] = [];
  const seen = new Set<string>();
  for (const v of mapped) {
    for (const gv of v.gameVersions) {
      if (seen.has(gv)) continue;
      seen.add(gv);
      gameVersions.push(gv);
    }
  }

  return { versions: mapped, gameVersions };
}

/**
 * For each Modrinth-tracked installed addon, find a newer compatible build
 * (same loader + MC version). Local-only jars are skipped.
 */
export async function checkInstalledAddonUpdates(opts: {
  serverDir: string;
  type: ServerType;
  mcVersion: string;
}): Promise<InstalledAddonUpdate[]> {
  const installed = await listInstalledAddons(opts.serverDir);
  const tracked = installed.filter(
    (a) => a.source === "modrinth" && a.projectId && !a.projectId.startsWith("local:"),
  );

  const results = await mapPool(tracked, 3, async (addon) => {
    try {
      const versions = await listCompatibleVersions(
        opts.type,
        opts.mcVersion,
        addon.projectId,
      );
      const latest = pickVersion(versions, null);
      if (!latest) return null;
      return {
        projectId: addon.projectId,
        currentVersionId: addon.versionId,
        currentVersionNumber: addon.versionNumber,
        latestVersionId: latest.versionId,
        latestVersionNumber: latest.versionNumber,
        available: latest.versionId !== addon.versionId,
      } satisfies InstalledAddonUpdate;
    } catch {
      return null;
    }
  });

  return results.filter((r): r is InstalledAddonUpdate => r !== null);
}

export async function getAddonProjectDetails(projectIdOrSlug: string): Promise<{
  projectId: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  categories: string[];
  gallery: {
    url: string;
    featured: boolean;
    title: string | null;
    description: string | null;
    ordering: number;
  }[];
  clientSide: string;
  serverSide: string;
  license: string | null;
  sourceUrl: string | null;
  issuesUrl: string | null;
  wikiUrl: string | null;
  discordUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  modrinthUrl: string;
  authors: string[];
}> {
  const project = await fetchJson<{
    id: string;
    slug: string;
    title: string;
    description: string;
    body: string;
    icon_url?: string | null;
    downloads: number;
    followers: number;
    categories: string[];
    additional_categories?: string[];
    gallery?: {
      url: string;
      featured: boolean;
      title?: string | null;
      description?: string | null;
      ordering?: number;
    }[];
    client_side: string;
    server_side: string;
    license?: { id?: string; name?: string; url?: string | null } | null;
    source_url?: string | null;
    issues_url?: string | null;
    wiki_url?: string | null;
    discord_url?: string | null;
    published?: string | null;
    updated?: string | null;
  }>(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectIdOrSlug)}`);

  let authors: string[] = [];
  try {
    const members = await fetchJson<
      { role: string; user: { username: string; name?: string | null } }[]
    >(`https://api.modrinth.com/v2/project/${encodeURIComponent(project.id)}/members`);
    authors = members
      .map((m) => m.user.name?.trim() || m.user.username)
      .filter(Boolean);
  } catch {
    authors = [];
  }

  const categories = [
    ...(project.categories ?? []),
    ...(project.additional_categories ?? []),
  ].filter((c) => !LOADER_CATEGORY_NAMES.has(c));

  const gallery = [...(project.gallery ?? [])]
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    .map((g) => ({
      url: g.url,
      featured: !!g.featured,
      title: g.title ?? null,
      description: g.description ?? null,
      ordering: g.ordering ?? 0,
    }));

  return {
    projectId: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    body: project.body || project.description || "",
    iconUrl: project.icon_url ?? null,
    downloads: project.downloads,
    follows: project.followers,
    categories,
    gallery,
    clientSide: project.client_side,
    serverSide: project.server_side,
    license: project.license?.name || project.license?.id || null,
    sourceUrl: project.source_url ?? null,
    issuesUrl: project.issues_url ?? null,
    wikiUrl: project.wiki_url ?? null,
    discordUrl: project.discord_url ?? null,
    publishedAt: project.published ?? null,
    updatedAt: project.updated ?? null,
    modrinthUrl: `https://modrinth.com/mod/${project.slug}`,
    authors,
  };
}

async function resolveVersion(
  type: ServerType,
  mcVersion: string,
  projectId: string,
  preferredVersionId?: string | null,
): Promise<AddonVersionInfo> {
  const compatible = await listCompatibleVersions(type, mcVersion, projectId);

  if (preferredVersionId) {
    const fromList = compatible.find((v) => v.versionId === preferredVersionId);
    if (fromList) return fromList;

    // Preferred dep version may not match filters — only accept if still compatible.
    try {
      const raw = await fetchJson<ModrinthVersion>(
        `https://api.modrinth.com/v2/version/${preferredVersionId}`,
      );
      const mapped = mapVersion(raw);
      const loaders = loadersFor(type);
      if (
        mapped &&
        raw.game_versions.includes(mcVersion) &&
        raw.loaders.some((l) => loaders.includes(l))
      ) {
        return mapped;
      }
    } catch {
      // fall through to compatible pick
    }
  }

  const chosen = pickVersion(compatible);
  if (!chosen) {
    throw new Error(
      `No Modrinth build found for project ${projectId} (Minecraft ${mcVersion} / ${type})`,
    );
  }
  return chosen;
}

async function downloadJar(url: string, dest: string): Promise<void> {
  const { fetchSafeDownload } = await import("./safe-url.js");
  let res: Response;
  try {
    res = await fetchSafeDownload(url, {
      headers: { "User-Agent": modrinthUserAgent() },
      signal: AbortSignal.timeout(MODRINTH_TIMEOUT_MS * 5),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("Modrinth download timed out — try again");
    }
    throw new Error(
      `Download failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
}

async function readZipEntry(jarPath: string, entryName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("unzip", ["-p", jarPath, entryName], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Built-in Fabric/Forge ids that are not separate Modrinth mods to install. */
const SKIP_MOD_IDS = new Set([
  "minecraft",
  "java",
  "fabricloader",
  "fabric-loader",
  "fabric",
  "forge",
  "neoforge",
  "quilt_loader",
  "quilt-loader",
]);

/** Well-known Fabric mod ids → Modrinth project id/slug. */
const FABRIC_MOD_ALIASES: Record<string, string> = {
  "fabric-api": "P7dR8mSH",
  "fabric-language-kotlin": "Ha28R6CL",
  "cloth-config": "9s6osm5g",
  "cloth-config2": "9s6osm5g",
  modmenu: "mOgUt4GM",
};

function isInstallableFabricModId(modId: string): boolean {
  if (SKIP_MOD_IDS.has(modId)) return false;
  // fabric-api ships many fabric-* modules inside one jar — don't install those separately.
  if (modId.startsWith("fabric-") && modId !== "fabric-api" && modId !== "fabric-language-kotlin") {
    return false;
  }
  return true;
}

async function resolveModIdToProject(modId: string): Promise<string | null> {
  if (!isInstallableFabricModId(modId)) return null;
  const alias = FABRIC_MOD_ALIASES[modId];
  if (alias) return alias;
  try {
    const project = await fetchJson<{ id: string }>(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(modId)}`,
    );
    return project.id;
  } catch {
    return null;
  }
}

/**
 * Read required dependency mod ids from a Fabric jar's fabric.mod.json.
 * Modrinth often omits these (e.g. JEI has dependencies: [] on Modrinth).
 */
async function fabricDependsFromJar(jarPath: string): Promise<string[]> {
  const raw = await readZipEntry(jarPath, "fabric.mod.json");
  if (!raw) return [];
  try {
    const meta = JSON.parse(raw) as {
      depends?: Record<string, string>;
      recommends?: Record<string, string>;
    };
    return Object.keys(meta.depends ?? {});
  } catch {
    return [];
  }
}

async function downloadToTemp(url: string, fileName: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "guartrix-addon-"));
  const dest = path.join(dir, fileName.replace(/[^\w.\-]+/g, "_") || "addon.jar");
  await downloadJar(url, dest);
  return dest;
}

async function installOne(opts: {
  serverDir: string;
  type: ServerType;
  kind: AddonKind;
  dir: string;
  projectId: string;
  version: AddonVersionInfo;
  cachedJarPath?: string;
}): Promise<InstalledAddon> {
  const project = await fetchJson<{
    id: string;
    slug: string;
    title: string;
    description?: string;
    icon_url?: string | null;
    categories?: string[];
  }>(`https://api.modrinth.com/v2/project/${opts.projectId}`);

  let author: string | null = null;
  try {
    const members = await fetchJson<{ user: { username: string }; role: string }[]>(
      `https://api.modrinth.com/v2/project/${opts.projectId}/members`,
    );
    const owner = members.find((m) => m.role.toLowerCase() === "owner") ?? members[0];
    author = owner?.user.username ?? null;
  } catch {
    // ignore
  }

  await fs.mkdir(opts.dir, { recursive: true });
  const dest = path.join(opts.dir, opts.version.fileName);
  if (opts.cachedJarPath) {
    await fs.copyFile(opts.cachedJarPath, dest);
  } else {
    await downloadJar(opts.version.fileUrl, dest);
  }

  const manifest = await readManifest(opts.serverDir);
  const next: InstalledAddon = {
    source: "modrinth",
    kind: opts.kind,
    projectId: project.id,
    slug: project.slug,
    title: project.title,
    versionId: opts.version.versionId,
    versionNumber: opts.version.versionNumber,
    fileName: opts.version.fileName,
    gameVersions: opts.version.gameVersions,
    installedAt: new Date().toISOString(),
    iconUrl: project.icon_url ?? null,
    description: project.description ?? null,
    author,
    categories: project.categories ?? [],
  };

  const filtered = manifest.addons.filter((a) => a.projectId !== project.id);
  const previous = manifest.addons.find((a) => a.projectId === project.id);
  if (previous && previous.fileName !== opts.version.fileName) {
    await fs.rm(path.join(opts.dir, previous.fileName), { force: true }).catch(() => undefined);
  }

  filtered.push(next);
  await writeManifest(opts.serverDir, { addons: filtered });
  return next;
}

/**
 * Install a Modrinth project and recursively install its required dependencies
 * (Modrinth metadata + fabric.mod.json depends, e.g. Fabric API for JEI).
 */
export async function installAddon(opts: {
  serverDir: string;
  type: ServerType;
  mcVersion: string;
  projectId: string;
  versionId?: string;
}): Promise<AddonInstallResult> {
  const kind = kindFor(opts.type);
  const dir = addonDir(opts.serverDir, opts.type);
  if (!kind || !dir) {
    throw new Error("This server type does not support addons");
  }

  type PlanItem = {
    projectId: string;
    version: AddonVersionInfo;
    isRoot: boolean;
    cachedJarPath?: string;
  };

  const plan: PlanItem[] = [];
  const visiting = new Set<string>();
  const plannedIds = new Set<string>();
  const alreadyPresent: InstalledAddon[] = [];
  const tempJars: string[] = [];
  const MAX_DEPTH = 12;

  async function collect(
    projectId: string,
    preferredVersionId: string | null | undefined,
    isRoot: boolean,
    depth: number,
  ): Promise<void> {
    if (depth > MAX_DEPTH) {
      throw new Error("Dependency tree is too deep (possible cycle)");
    }
    if (visiting.has(projectId) || plannedIds.has(projectId)) return;
    visiting.add(projectId);

    const manifest = await readManifest(opts.serverDir);
    const existing = manifest.addons.find(
      (a) => a.projectId === projectId || a.slug === projectId,
    );
    if (existing && !isRoot) {
      alreadyPresent.push(existing);
      visiting.delete(projectId);
      return;
    }

    let version: AddonVersionInfo;
    try {
      version = await resolveVersion(
        opts.type,
        opts.mcVersion,
        projectId,
        preferredVersionId,
      );
    } catch (err) {
      const project = await fetchJson<{ title?: string; slug?: string }>(
        `https://api.modrinth.com/v2/project/${projectId}`,
      ).catch(() => null);
      const label = project?.title ?? project?.slug ?? projectId;
      throw new Error(
        `Required dependency "${label}" has no compatible build for Minecraft ${opts.mcVersion} / ${opts.type}${
          err instanceof Error ? ` (${err.message})` : ""
        }`,
      );
    }

    // Prefer full version payload (some list responses omit dependency details).
    try {
      const full = await fetchJson<ModrinthVersion>(
        `https://api.modrinth.com/v2/version/${version.versionId}`,
      );
      version = mapVersion(full) ?? version;
    } catch {
      // keep filtered version
    }

    const requiredDeps = version.dependencies.filter(
      (d) => d.dependencyType === "required" && d.projectId,
    );
    for (const dep of requiredDeps) {
      await collect(dep.projectId!, dep.versionId, false, depth + 1);
    }

    let cachedJarPath: string | undefined;
    // Modrinth often leaves dependencies empty (JEI). Read fabric.mod.json from the jar.
    if (opts.type === "FABRIC") {
      cachedJarPath = await downloadToTemp(version.fileUrl, version.fileName);
      tempJars.push(cachedJarPath);
      const jarDepends = await fabricDependsFromJar(cachedJarPath);
      for (const modId of jarDepends) {
        const depProject = await resolveModIdToProject(modId);
        if (!depProject) continue;
        await collect(depProject, null, false, depth + 1);
      }
    }

    if (!plannedIds.has(projectId)) {
      plannedIds.add(projectId);
      plan.push({ projectId, version, isRoot, cachedJarPath });
    }
    visiting.delete(projectId);
  }

  try {
    await collect(opts.projectId, opts.versionId, true, 0);

    const installedItems: InstalledAddon[] = [];
    let root: InstalledAddon | null = null;
    for (const item of plan) {
      const installed = await installOne({
        serverDir: opts.serverDir,
        type: opts.type,
        kind,
        dir,
        projectId: item.projectId,
        version: item.version,
        cachedJarPath: item.cachedJarPath,
      });
      if (item.isRoot) root = installed;
      else installedItems.push(installed);
    }

    if (!root) {
      throw new Error("Install produced no addons");
    }

    return {
      installed: root,
      dependenciesInstalled: installedItems,
      alreadyPresent: alreadyPresent.filter(
        (a, i, arr) => arr.findIndex((x) => x.projectId === a.projectId) === i,
      ),
      restartRequired: true,
    };
  } finally {
    for (const jar of tempJars) {
      await fs.rm(path.dirname(jar), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function uninstallAddon(
  serverDir: string,
  type: ServerType,
  projectId: string,
): Promise<void> {
  const dir = addonDir(serverDir, type);
  if (!dir) throw new Error("This server type does not support addons");

  const manifest = await readManifest(serverDir);
  const addon = manifest.addons.find((a) => a.projectId === projectId);
  if (!addon) throw new Error("Addon not found in manifest");

  await fs.rm(path.join(dir, addon.fileName), { force: true });
  await writeManifest(serverDir, {
    addons: manifest.addons.filter((a) => a.projectId !== projectId),
  });
}

async function sha512File(filePath: string): Promise<string> {
  const hash = createHash("sha512");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function localProjectId(fileName: string): string {
  return `local:${fileName}`;
}

function isJarName(name: string): boolean {
  return name.toLowerCase().endsWith(".jar") && !name.startsWith(".");
}

/**
 * Rescan mods/ or plugins/ and reconcile guartrix-addons.json with jars on disk.
 * Matches files via Modrinth SHA-512 (`version_files`); unmatched jars are kept
 * as `source: "local"` so they still appear in the panel.
 */
export async function syncInstalledAddons(
  serverDir: string,
  type: ServerType,
): Promise<AddonSyncResult> {
  const kind = kindFor(type);
  const dir = addonDir(serverDir, type);
  if (!kind || !dir) {
    throw new Error("This server type does not support addons");
  }

  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const jars = entries
    .filter((e) => e.isFile() && isJarName(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const previous = await readManifest(serverDir);
  const prevByFile = new Map(previous.addons.map((a) => [a.fileName, a]));
  const prevByProject = new Map(previous.addons.map((a) => [a.projectId, a]));

  const hashByFile = new Map<string, string>();
  for (const fileName of jars) {
    hashByFile.set(fileName, await sha512File(path.join(dir, fileName)));
  }

  const hashes = [...new Set(hashByFile.values())];
  const versionByHash = new Map<string, ModrinthVersion & { project_id: string }>();
  /** True when Modrinth answered at least one request (even empty). */
  let modrinthReachable = false;

  // Modrinth accepts up to 1000 hashes per request; we batch by 100.
  for (let i = 0; i < hashes.length; i += 100) {
    const chunk = hashes.slice(i, i + 100);
    if (chunk.length === 0) continue;
    try {
      const found = await fetchJson<
        Record<string, ModrinthVersion & { project_id: string }>
      >("https://api.modrinth.com/v2/version_files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes: chunk, algorithm: "sha512" }),
      });
      modrinthReachable = true;
      for (const [hash, version] of Object.entries(found ?? {})) {
        if (version?.project_id) versionByHash.set(hash, version);
      }
    } catch (err) {
      console.warn(
        "[addons] version_files batch failed:",
        err instanceof Error ? err.message : err,
      );
      for (const hash of chunk) {
        try {
          const version = await fetchJson<ModrinthVersion & { project_id: string }>(
            `https://api.modrinth.com/v2/version_file/${hash}?algorithm=sha512`,
          );
          modrinthReachable = true;
          if (version?.project_id) versionByHash.set(hash, version);
        } catch (lookupErr) {
          const msg =
            lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
          // 404 = not on Modrinth (reachable). Network/5xx = keep previous metadata.
          if (/Modrinth HTTP 404/.test(msg)) modrinthReachable = true;
        }
      }
    }
  }

  type Candidate = {
    fileName: string;
    hash: string;
    version: ModrinthVersion & { project_id: string };
    mtimeMs: number;
    size: number;
  };
  const byProject = new Map<string, Candidate[]>();
  const unmatchedFiles: string[] = [];

  for (const fileName of jars) {
    const hash = hashByFile.get(fileName)!;
    const version = versionByHash.get(hash);
    if (!version) {
      unmatchedFiles.push(fileName);
      continue;
    }
    const st = await fs.stat(path.join(dir, fileName));
    const list = byProject.get(version.project_id) ?? [];
    list.push({
      fileName,
      hash,
      version,
      mtimeMs: st.mtimeMs,
      size: st.size,
    });
    byProject.set(version.project_id, list);
  }

  const duplicates: string[] = [];
  const nextAddons: InstalledAddon[] = [];
  const projectCache = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      description?: string;
      icon_url?: string | null;
      categories?: string[];
      author: string | null;
    }
  >();

  async function loadProject(projectId: string) {
    const cached = projectCache.get(projectId);
    if (cached) return cached;
    const project = await fetchJson<{
      id: string;
      slug: string;
      title: string;
      description?: string;
      icon_url?: string | null;
      categories?: string[];
    }>(`https://api.modrinth.com/v2/project/${projectId}`);
    let author: string | null = null;
    try {
      const members = await fetchJson<{ user: { username: string }; role: string }[]>(
        `https://api.modrinth.com/v2/project/${projectId}/members`,
      );
      const owner =
        members.find((m) => m.role.toLowerCase() === "owner") ?? members[0];
      author = owner?.user.username ?? null;
    } catch {
      // ignore
    }
    const row = {
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      icon_url: project.icon_url,
      categories: project.categories,
      author,
    };
    projectCache.set(projectId, row);
    return row;
  }

  for (const [projectId, candidates] of byProject) {
    candidates.sort((a, b) => {
      const aPrimary =
        a.version.files.find((f) => f.primary)?.filename === a.fileName ||
        a.version.files.some((f) => f.filename === a.fileName)
          ? 1
          : 0;
      const bPrimary =
        b.version.files.find((f) => f.primary)?.filename === b.fileName ||
        b.version.files.some((f) => f.filename === b.fileName)
          ? 1
          : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return b.size - a.size;
    });
    const chosen = candidates[0]!;
    for (const extra of candidates.slice(1)) {
      duplicates.push(extra.fileName);
    }

    const project = await loadProject(projectId);
    const mapped = mapVersion(chosen.version);
    const prev =
      prevByFile.get(chosen.fileName) ?? prevByProject.get(project.id) ?? null;
    nextAddons.push({
      source: "modrinth",
      kind,
      projectId: project.id,
      slug: project.slug,
      title: project.title,
      versionId: chosen.version.id,
      versionNumber: mapped?.versionNumber ?? chosen.version.version_number,
      fileName: chosen.fileName,
      gameVersions: mapped?.gameVersions ?? chosen.version.game_versions ?? [],
      installedAt: prev?.installedAt ?? new Date().toISOString(),
      iconUrl: project.icon_url ?? null,
      description: project.description ?? null,
      author: project.author,
      categories: project.categories ?? [],
    });
  }

  for (const fileName of unmatchedFiles) {
    const prev = prevByFile.get(fileName);
    // If Modrinth was unreachable, keep previous Modrinth metadata for known jars.
    if (prev?.source === "modrinth" && !modrinthReachable) {
      if (!nextAddons.some((a) => a.projectId === prev.projectId)) {
        nextAddons.push({ ...prev, kind, fileName });
      } else {
        duplicates.push(fileName);
      }
      continue;
    }
    const base = fileName.replace(/\.jar$/i, "");
    nextAddons.push({
      source: "local",
      kind,
      projectId: prev?.source === "local" ? prev.projectId : localProjectId(fileName),
      slug: prev?.slug ?? base,
      title: prev?.title && prev.source === "local" ? prev.title : base,
      versionId: "",
      versionNumber: "local",
      fileName,
      gameVersions: [],
      installedAt: prev?.installedAt ?? new Date().toISOString(),
      iconUrl: null,
      description: "Present on disk; not found on Modrinth (hash mismatch).",
      author: null,
      categories: [],
    });
  }

  nextAddons.sort((a, b) => a.title.localeCompare(b.title));

  const prevKeys = new Set(
    previous.addons.map((a) => `${a.projectId}\0${a.fileName}`),
  );
  const nextKeys = new Set(nextAddons.map((a) => `${a.projectId}\0${a.fileName}`));
  const added = nextAddons.filter(
    (a) => !prevKeys.has(`${a.projectId}\0${a.fileName}`),
  );
  const removed = previous.addons.filter(
    (a) => !nextKeys.has(`${a.projectId}\0${a.fileName}`),
  );

  await writeManifest(serverDir, { addons: nextAddons });

  return {
    installed: nextAddons,
    added,
    removed,
    duplicates,
    folder: kind === "plugin" ? "plugins" : "mods",
    jarCount: jars.length,
  };
}
