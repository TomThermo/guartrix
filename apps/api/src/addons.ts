import fs from "node:fs/promises";
import path from "node:path";
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
  categoryLabel,
  fetchJson,
  loadersFor,
  mapVersion,
  pickVersion,
} from "./addons-modrinth.js";
import type { AddonInstallResult } from "./addons-install.js";

export type { AddonKind, AddonVersionInfo };
export type { AddonInstallResult };
export { installAddon, uninstallAddon } from "./addons-install.js";
export { syncInstalledAddons } from "./addons-sync.js";

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

interface Manifest {
  addons: InstalledAddon[];
}

export function kindFor(type: ServerType): AddonKind | null {
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

export async function readManifest(serverDir: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath(serverDir), "utf8");
    const data = JSON.parse(raw) as Manifest;
    return { addons: Array.isArray(data.addons) ? data.addons : [] };
  } catch {
    return { addons: [] };
  }
}

export async function writeManifest(serverDir: string, manifest: Manifest): Promise<void> {
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
  projectType: string;
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
    project_type: string;
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

  const projectType = project.project_type || "mod";
  const typePath =
    projectType === "modpack"
      ? "modpack"
      : projectType === "plugin"
        ? "plugin"
        : projectType === "datapack"
          ? "datapack"
          : "mod";

  return {
    projectId: project.id,
    slug: project.slug,
    projectType,
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
    modrinthUrl: `https://modrinth.com/${typePath}/${project.slug}`,
    authors,
  };
}

