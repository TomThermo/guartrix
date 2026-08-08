import type { AddonKind, AddonSortIndex, ServerType } from "./server.js";

export interface AddonSearchHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  follows: number;
  author: string;
  categories: string[];
}

export interface AddonGalleryImage {
  url: string;
  featured: boolean;
  title: string | null;
  description: string | null;
  ordering: number;
}

export interface AddonProjectDetails {
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
  gallery: AddonGalleryImage[];
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
}

export interface AddonSearchResponse {
  type: ServerType;
  mcVersion: string;
  kind: AddonKind | null;
  hits: AddonSearchHit[];
  totalHits: number;
  offset: number;
  limit: number;
  index: AddonSortIndex;
  category: string | null;
}

export interface AddonCategory {
  name: string;
  label: string;
}

export interface AddonVersionInfo {
  versionId: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  fileName: string;
  fileUrl: string;
  fileSize: number;
  releaseChannel: string;
  changelog?: string | null;
  datePublished?: string | null;
  dependencies?: AddonDependency[];
}

export interface AddonDependency {
  projectId: string | null;
  versionId: string | null;
  dependencyType: "required" | "optional" | "incompatible" | "embedded" | string;
}

export interface InstalledAddon {
  /** `modrinth` = matched via Modrinth; `local` = jar on disk without Modrinth match. */
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

export interface AddonSyncResult {
  installed: InstalledAddon[];
  /** Newly matched or local-tracked jars. */
  added: InstalledAddon[];
  /** Manifest entries removed because the jar is gone. */
  removed: InstalledAddon[];
  /** Extra jars for the same Modrinth project (not in manifest). */
  duplicates: string[];
  folder: string;
  jarCount: number;
}

/** Update availability for one installed Modrinth addon. */
export interface InstalledAddonUpdate {
  projectId: string;
  currentVersionId: string;
  currentVersionNumber: string;
  latestVersionId: string;
  latestVersionNumber: string;
  available: boolean;
}

export interface AddonInstallResult {
  installed: InstalledAddon;
  dependenciesInstalled: InstalledAddon[];
  alreadyPresent: InstalledAddon[];
  restartRequired: boolean;
}

/** Curated Paper/Purpur plugin stacks (Modrinth project ids). */
export interface PluginStackItem {
  projectId: string;
  slug: string;
  name: string;
  /** Optional Modrinth version id for reproducible installs. */
  versionId?: string;
  /** Human version label when versionId is pinned. */
  versionNumber?: string;
}

export interface PluginStack {
  id: string;
  name: string;
  description: string;
  items: PluginStackItem[];
}

export const RECOMMENDED_PLUGIN_STACKS: PluginStack[] = [
  {
    id: "essentials",
    name: "Essentials",
    description: "Core survival utilities: homes, kits, warps, and moderation basics.",
    items: [
      { projectId: "hXiIvTyT", slug: "essentialsx", name: "EssentialsX" },
      { projectId: "Vebnzrzj", slug: "luckperms", name: "LuckPerms" },
    ],
  },
  {
    id: "moderation",
    name: "Moderation & audit",
    description: "Permissions, rollback, and performance insight.",
    items: [
      { projectId: "Vebnzrzj", slug: "luckperms", name: "LuckPerms" },
      { projectId: "Lu3KuzdV", slug: "coreprotect", name: "CoreProtect" },
      { projectId: "l6YH9Als", slug: "spark", name: "spark" },
    ],
  },
  {
    id: "map",
    name: "Live map",
    description: "In-browser explored-chunk map (BlueMap).",
    items: [{ projectId: "swbUV1cr", slug: "bluemap", name: "BlueMap" }],
  },
];
