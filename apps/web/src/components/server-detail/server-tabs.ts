/** Tab ids, menu groups, and URL helpers for the server detail page. */

export type TabId =
  | "settings"
  | "seedmap"
  | "engine"
  | "addons"
  | "modpacks"
  | "files"
  | "sftp"
  | "console"
  | "resources"
  | "players"
  | "bans"
  | "whitelist"
  | "backups"
  | "activity"
  | "logs"
  | "tasks"
  | "databases"
  | "allocations"
  | "subusers";

export type MenuGroupId =
  | "control"
  | "filesData"
  | "networkAccess"
  | "game"
  | "players"
  | "ops";

/** i18n key under `tabs.*` for menu group headers. */
export const MENU_GROUPS: Array<{ id: MenuGroupId; labelKey: string }> = [
  { id: "control", labelKey: "tabs.control" },
  { id: "filesData", labelKey: "tabs.filesData" },
  { id: "networkAccess", labelKey: "tabs.networkAccess" },
  { id: "game", labelKey: "tabs.game" },
  { id: "players", labelKey: "tabs.playersGroup" },
  { id: "ops", labelKey: "tabs.ops" },
];

export const SERVER_TABS: Array<{
  id: TabId;
  icon: string;
  /** i18n key under `tabs.*` */
  labelKey: string;
  group: MenuGroupId;
  adminOnly?: boolean;
  /** Any of these permissions grants tab visibility (`*` always ok). */
  anyOf?: string[];
}> = [
  // Control
  {
    id: "console",
    icon: "fa-terminal",
    labelKey: "tabs.console",
    group: "control",
    anyOf: [
      "control.console.read",
      "control.console",
      "control.start",
      "control.stop",
      "control.restart",
      "control.kill",
      "allocation.read",
    ],
  },
  {
    id: "resources",
    icon: "fa-chart-line",
    labelKey: "tabs.resources",
    group: "control",
  },
  // Files & data
  {
    id: "files",
    icon: "fa-folder-open",
    labelKey: "tabs.files",
    group: "filesData",
    anyOf: ["file.read"],
  },
  {
    id: "sftp",
    icon: "fa-network-wired",
    labelKey: "tabs.sftp",
    group: "filesData",
    anyOf: ["file.sftp"],
  },
  {
    id: "databases",
    icon: "fa-database",
    labelKey: "tabs.databases",
    group: "filesData",
    anyOf: ["database.read"],
  },
  {
    id: "backups",
    icon: "fa-box-archive",
    labelKey: "tabs.backups",
    group: "filesData",
    anyOf: ["backup.read"],
  },
  // Network & access
  {
    id: "allocations",
    icon: "fa-ethernet",
    labelKey: "tabs.allocations",
    group: "networkAccess",
    anyOf: ["allocation.read"],
  },
  // Game
  {
    id: "settings",
    icon: "fa-gear",
    labelKey: "tabs.settings",
    group: "game",
    anyOf: ["settings.read", "settings.update", "startup.read", "startup.update"],
  },
  {
    id: "engine",
    icon: "fa-microchip",
    labelKey: "tabs.engine",
    group: "game",
    anyOf: ["settings.read", "settings.update"],
  },
  {
    id: "seedmap",
    icon: "fa-map-location-dot",
    labelKey: "tabs.seedmap",
    group: "game",
    anyOf: ["settings.read", "control.console"],
  },
  {
    id: "addons",
    icon: "fa-puzzle-piece",
    labelKey: "tabs.addons",
    group: "game",
    anyOf: ["addon.read"],
  },
  {
    id: "modpacks",
    icon: "fa-cubes",
    labelKey: "tabs.modpacks",
    group: "game",
    anyOf: ["addon.read"],
  },
  // Players
  {
    id: "players",
    icon: "fa-user-plus",
    labelKey: "tabs.players",
    group: "players",
    anyOf: ["player.read"],
  },
  {
    id: "whitelist",
    icon: "fa-user-check",
    labelKey: "tabs.whitelist",
    group: "players",
    anyOf: ["player.read", "player.update", "settings.read", "settings.update"],
  },
  {
    id: "bans",
    icon: "fa-ban",
    labelKey: "tabs.bans",
    group: "players",
    anyOf: ["player.read"],
  },
  // Ops
  {
    id: "tasks",
    icon: "fa-clock",
    labelKey: "tabs.tasks",
    group: "ops",
    anyOf: ["schedule.read"],
  },
  {
    id: "subusers",
    icon: "fa-user-group",
    labelKey: "tabs.subusers",
    group: "ops",
    anyOf: ["user.read", "user.create", "user.update", "user.delete"],
  },
  {
    id: "activity",
    icon: "fa-list-check",
    labelKey: "tabs.activity",
    group: "ops",
    anyOf: ["activity.read", "audit.read"],
  },
  {
    id: "logs",
    icon: "fa-magnifying-glass",
    labelKey: "tabs.logs",
    group: "ops",
    anyOf: ["audit.read"],
  },
];

export const TAB_IDS = new Set<string>([
  "settings",
  "seedmap",
  "engine",
  "addons",
  "modpacks",
  "files",
  "sftp",
  "console",
  "resources",
  "players",
  "bans",
  "whitelist",
  "backups",
  "activity",
  "logs",
  "tasks",
  "databases",
  "allocations",
  "subusers",
]);

export function parseTabParam(value: string | null): TabId | null {
  if (!value || !TAB_IDS.has(value)) return null;
  return value as TabId;
}
