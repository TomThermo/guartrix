export type ModpackSource = "modrinth" | "curseforge";

export type ModpackHit = {
  key: string;
  projectId?: string;
  modId?: number;
  title: string;
  description: string;
  downloads: number;
  follows: number;
  author: string;
  iconUrl: string | null;
  categories: string[];
};

export function normalizeModpackHit(
  hit: Record<string, unknown>,
  source: ModpackSource,
): ModpackHit {
  if (source === "curseforge") {
    const authors = Array.isArray(hit.authors) ? (hit.authors as Array<{ name?: string }>) : [];
    const logo =
      hit.logo && typeof hit.logo === "object"
        ? (hit.logo as { thumbnailUrl?: string; url?: string })
        : null;
    const categories = Array.isArray(hit.categories)
      ? (hit.categories as Array<{ name?: string }>)
          .map((c) => c.name)
          .filter((n): n is string => Boolean(n))
      : [];
    return {
      key: String(hit.id ?? hit.slug ?? ""),
      modId: Number(hit.id),
      title: String(hit.name ?? hit.title ?? hit.id ?? "modpack"),
      description: String(hit.summary ?? hit.description ?? ""),
      downloads: Number(hit.downloadCount ?? hit.downloads ?? 0),
      follows: Number(hit.thumbsUpCount ?? hit.follows ?? 0),
      author: String(authors[0]?.name ?? ""),
      iconUrl: logo?.thumbnailUrl || logo?.url || null,
      categories,
    };
  }

  const categories = Array.isArray(hit.categories)
    ? (hit.categories as string[]).filter(Boolean)
    : Array.isArray(hit.display_categories)
      ? (hit.display_categories as string[]).filter(Boolean)
      : [];
  const loaders = new Set([
    "fabric",
    "forge",
    "neoforge",
    "quilt",
    "bukkit",
    "spigot",
    "paper",
    "purpur",
    "folia",
    "rift",
    "liteloader",
  ]);
  return {
    key: String(hit.project_id ?? hit.slug ?? hit.id ?? ""),
    projectId: String(hit.project_id ?? hit.slug ?? ""),
    title: String(hit.title ?? hit.name ?? "modpack"),
    description: String(hit.description ?? ""),
    downloads: Number(hit.downloads ?? 0),
    follows: Number(hit.follows ?? 0),
    author: String(hit.author ?? ""),
    iconUrl: typeof hit.icon_url === "string" ? hit.icon_url : null,
    categories: categories.filter((c) => !loaders.has(c)),
  };
}
