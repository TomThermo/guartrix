import type { AddonSortIndex, AddonSearchHit, InstalledAddonUpdate, ServerType } from "@guartrix/shared";
import type { AddonVersionInfo, ModrinthVersion } from "../addons-modrinth.js";
import {
  LOADER_CATEGORY_NAMES,
  MODRINTH_MAX_ATTEMPTS,
  fetchJson,
  loadersFor,
  mapVersion,
  pickVersion,
} from "../addons-modrinth.js";
import { listInstalledAddons } from "./list.js";
import { kindFor } from "./manifest.js";

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
    kind === "plugin" ? ["project_type:plugin", "project_type:mod"] : ["project_type:mod"];
  const categoryFacet =
    category && !LOADER_CATEGORY_NAMES.has(category) ? [`categories:${category}`] : null;

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

  const mapped = versions.map(mapVersion).filter((v): v is AddonVersionInfo => v !== null);

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
      const versions = await listCompatibleVersions(opts.type, opts.mcVersion, addon.projectId);
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
    authors = members.map((m) => m.user.name?.trim() || m.user.username).filter(Boolean);
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
