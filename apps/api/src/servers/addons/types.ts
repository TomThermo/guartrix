import type { AddonKind } from "@msm/shared";

export type { AddonKind };

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

export interface Manifest {
  addons: InstalledAddon[];
}
