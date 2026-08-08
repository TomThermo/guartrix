import type { AddonSyncResult, InstalledAddonUpdate } from "@msm/shared";
import type { AddonVersionInfo } from "./addons-modrinth.js";
import type { AddonInstallResult } from "./addons-install.js";
import type { AddonKind, InstalledAddon } from "./addons/types.js";

export type { AddonKind, AddonVersionInfo };
export type { AddonInstallResult };
export type { InstalledAddon };
export type { AddonSyncResult, InstalledAddonUpdate };

export { installAddon, uninstallAddon } from "./addons-install.js";
export { syncInstalledAddons } from "./addons-sync.js";

export { kindFor, addonDir, readManifest, writeManifest } from "./addons/manifest.js";
export { listAddonCategories, listInstalledAddons } from "./addons/list.js";
export {
  searchAddons,
  listCompatibleVersions,
  listLoaderAddonVersions,
  checkInstalledAddonUpdates,
  getAddonProjectDetails,
} from "./addons/search.js";
