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
  | "bots"
  | "databases"
  | "allocations"
  | "subusers";

export type MenuGroupId = "service" | "game" | "management";

/** i18n key under `tabs.*` for menu group headers. */
export const MENU_GROUPS: Array<{ id: MenuGroupId; labelKey: string }> = [
  { id: "service", labelKey: "tabs.service" },
  { id: "game", labelKey: "tabs.game" },
  { id: "management", labelKey: "tabs.management" },
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
  // Manage Service
  {
    id: "console",
    icon: "fa-terminal",
    labelKey: "tabs.console",
    group: "service",
    anyOf: [
      "control.console",
      "control.start",
      "control.stop",
      "control.restart",
      "control.kill",
      "allocation.read",
    ],
  },
  {
    id: "files",
    icon: "fa-folder-open",
    labelKey: "tabs.files",
    group: "service",
    anyOf: ["file.read"],
  },
  {
    id: "sftp",
    icon: "fa-network-wired",
    labelKey: "tabs.sftp",
    group: "service",
    anyOf: ["file.sftp"],
  },
  {
    id: "databases",
    icon: "fa-database",
    labelKey: "tabs.databases",
    group: "service",
    anyOf: ["database.read"],
  },
  {
    id: "allocations",
    icon: "fa-ethernet",
    labelKey: "tabs.allocations",
    group: "service",
    anyOf: ["allocation.read"],
  },
  {
    id: "backups",
    icon: "fa-box-archive",
    labelKey: "tabs.backups",
    group: "service",
    anyOf: ["backup.read"],
  },
  {
    id: "subusers",
    icon: "fa-user-group",
    labelKey: "tabs.subusers",
    group: "service",
    anyOf: ["user.read", "user.create", "user.update", "user.delete"],
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
    id: "seedmap",
    icon: "fa-map-location-dot",
    labelKey: "tabs.seedmap",
    group: "game",
    anyOf: ["settings.read", "control.console"],
  },
  {
    id: "engine",
    icon: "fa-microchip",
    labelKey: "tabs.engine",
    group: "game",
    anyOf: ["settings.read", "settings.update"],
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
  {
    id: "whitelist",
    icon: "fa-user-check",
    labelKey: "tabs.whitelist",
    group: "game",
    anyOf: ["player.read", "player.update", "settings.read", "settings.update"],
  },
  {
    id: "players",
    icon: "fa-user-plus",
    labelKey: "tabs.players",
    group: "game",
    anyOf: ["player.read"],
  },
  {
    id: "bans",
    icon: "fa-ban",
    labelKey: "tabs.bans",
    group: "game",
    anyOf: ["player.read"],
  },
  // Management
  {
    id: "tasks",
    icon: "fa-clock",
    labelKey: "tabs.tasks",
    group: "management",
    anyOf: ["schedule.read"],
  },
  {
    id: "activity",
    icon: "fa-list-check",
    labelKey: "tabs.activity",
    group: "management",
    anyOf: ["activity.read", "audit.read"],
  },
  {
    id: "logs",
    icon: "fa-magnifying-glass",
    labelKey: "tabs.logs",
    group: "management",
    anyOf: ["audit.read"],
  },
  {
    id: "resources",
    icon: "fa-chart-line",
    labelKey: "tabs.resources",
    group: "management",
  },
  {
    id: "bots",
    icon: "fa-robot",
    labelKey: "tabs.bots",
    group: "management",
    adminOnly: true,
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
  "bots",
  "databases",
  "allocations",
  "subusers",
]);

export function parseTabParam(value: string | null): TabId | null {
  if (!value || !TAB_IDS.has(value)) return null;
  return value as TabId;
}
