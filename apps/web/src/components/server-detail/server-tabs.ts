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

export const MENU_GROUPS: Array<{ id: MenuGroupId; label: string }> = [
  { id: "service", label: "Manage Service" },
  { id: "game", label: "Game" },
  { id: "management", label: "Management" },
];

export const SERVER_TABS: Array<{
  id: TabId;
  icon: string;
  label: string;
  group: MenuGroupId;
  adminOnly?: boolean;
  /** Any of these permissions grants tab visibility (`*` always ok). */
  anyOf?: string[];
}> = [
  // Manage Service
  {
    id: "console",
    icon: "fa-terminal",
    label: "Console",
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
    label: "File Manager",
    group: "service",
    anyOf: ["file.read"],
  },
  {
    id: "sftp",
    icon: "fa-network-wired",
    label: "SFTP",
    group: "service",
    anyOf: ["file.sftp"],
  },
  {
    id: "databases",
    icon: "fa-database",
    label: "Databases",
    group: "service",
    anyOf: ["database.read"],
  },
  {
    id: "allocations",
    icon: "fa-ethernet",
    label: "Network",
    group: "service",
    anyOf: ["allocation.read"],
  },
  {
    id: "backups",
    icon: "fa-box-archive",
    label: "Backups",
    group: "service",
    anyOf: ["backup.read"],
  },
  {
    id: "subusers",
    icon: "fa-user-group",
    label: "Subusers",
    group: "service",
    anyOf: ["user.read", "user.create", "user.update", "user.delete"],
  },
  // Game
  {
    id: "settings",
    icon: "fa-gear",
    label: "Server Properties",
    group: "game",
    anyOf: ["settings.read", "settings.update", "startup.read", "startup.update"],
  },
  {
    id: "seedmap",
    icon: "fa-map-location-dot",
    label: "World Map",
    group: "game",
    anyOf: ["settings.read", "control.console"],
  },
  {
    id: "engine",
    icon: "fa-microchip",
    label: "Engine",
    group: "game",
    anyOf: ["settings.read", "settings.update"],
  },
  {
    id: "addons",
    icon: "fa-puzzle-piece",
    label: "Plugin Management",
    group: "game",
    anyOf: ["addon.read"],
  },
  {
    id: "modpacks",
    icon: "fa-cubes",
    label: "Modpacks",
    group: "game",
    anyOf: ["addon.read"],
  },
  {
    id: "whitelist",
    icon: "fa-user-check",
    label: "Whitelist Manager",
    group: "game",
    anyOf: ["player.read", "player.update", "settings.read", "settings.update"],
  },
  {
    id: "players",
    icon: "fa-user-plus",
    label: "Online Players",
    group: "game",
    anyOf: ["player.read"],
  },
  {
    id: "bans",
    icon: "fa-ban",
    label: "Bans",
    group: "game",
    anyOf: ["player.read"],
  },
  // Management
  {
    id: "tasks",
    icon: "fa-clock",
    label: "Schedules",
    group: "management",
    anyOf: ["schedule.read"],
  },
  {
    id: "activity",
    icon: "fa-list-check",
    label: "Activity Log",
    group: "management",
    anyOf: ["activity.read", "audit.read"],
  },
  {
    id: "logs",
    icon: "fa-magnifying-glass",
    label: "Log Files",
    group: "management",
    anyOf: ["audit.read"],
  },
  {
    id: "resources",
    icon: "fa-chart-line",
    label: "Resources",
    group: "management",
  },
  {
    id: "bots",
    icon: "fa-robot",
    label: "Bots",
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
