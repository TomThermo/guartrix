/** Fine-grained server permissions for subusers. */

export const SERVER_PERMISSIONS = [
  // Power Management
  "control.start",
  "control.stop",
  "control.restart",
  "control.kill",
  "control.console",
  // Subuser Management
  "user.read",
  "user.create",
  "user.update",
  "user.delete",
  // Server Management
  "allocation.read",
  "allocation.create",
  "allocation.update",
  "allocation.delete",
  "settings.read",
  "settings.update",
  "startup.read",
  "startup.update",
  "audit.read",
  "activity.read",
  // Database Management
  "database.read",
  "database.create",
  "database.update",
  "database.delete",
  // File Management
  "file.sftp",
  "file.read",
  "file.read-content",
  "file.create",
  "file.update",
  "file.delete",
  "file.archive",
  "file.upload",
  "file.download",
  // Backup Management
  "backup.read",
  "backup.create",
  "backup.delete",
  "backup.restore",
  // Schedule Management
  "schedule.read",
  "schedule.create",
  "schedule.update",
  "schedule.delete",
  // Players / bans / whitelist
  "player.read",
  "player.update",
  // Addons
  "addon.read",
  "addon.update",
] as const;

export type ServerPermission = (typeof SERVER_PERMISSIONS)[number];

export function isServerPermission(value: string): value is ServerPermission {
  return (SERVER_PERMISSIONS as readonly string[]).includes(value);
}

export interface PermissionMeta {
  key: ServerPermission;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "power",
    label: "Power Management",
    permissions: [
      {
        key: "control.start",
        label: "Start Server",
        description: "Allows the user to start the server.",
      },
      {
        key: "control.stop",
        label: "Stop Server",
        description: "Allows the user to stop the server.",
      },
      {
        key: "control.restart",
        label: "Restart Server",
        description: "Allows the user to restart the server.",
      },
      {
        key: "control.kill",
        label: "Kill Server",
        description: "Allows the user to force-kill the server process.",
      },
      {
        key: "control.console",
        label: "Send Console Command",
        description:
          "Allows sending commands from the console. Without stop/restart permissions they cannot send the stop command.",
      },
    ],
  },
  {
    id: "user",
    label: "Subuser Management",
    permissions: [
      {
        key: "user.read",
        label: "List Subusers",
        description: "Allows viewing all subusers assigned to the server.",
      },
      {
        key: "user.create",
        label: "Create Subuser",
        description: "Allows creating additional subusers on the server.",
      },
      {
        key: "user.update",
        label: "Edit Subuser",
        description: "Allows editing permissions assigned to other subusers.",
      },
      {
        key: "user.delete",
        label: "Delete Subuser",
        description: "Allows removing other subusers from the server.",
      },
    ],
  },
  {
    id: "server",
    label: "Server Management",
    permissions: [
      {
        key: "allocation.read",
        label: "View Allocations",
        description: "Allows viewing IP/port allocations assigned to the server.",
      },
      {
        key: "allocation.create",
        label: "Create Allocations",
        description: "Allows assigning additional ports to the server.",
      },
      {
        key: "allocation.update",
        label: "Update Allocations",
        description: "Allows changing notes or primary allocation.",
      },
      {
        key: "allocation.delete",
        label: "Delete Allocations",
        description: "Allows removing secondary ports from the server.",
      },
      {
        key: "settings.read",
        label: "View Settings",
        description: "Allows viewing server settings and properties.",
      },
      {
        key: "settings.update",
        label: "Edit Settings",
        description: "Allows editing server.properties and general settings.",
      },
      {
        key: "startup.read",
        label: "View Startup",
        description: "Allows viewing startup-related settings (memory, auto-restart).",
      },
      {
        key: "startup.update",
        label: "Edit Startup",
        description: "Allows modifying startup settings such as memory and auto-restart.",
      },
      {
        key: "audit.read",
        label: "Log Files",
        description: "Allows viewing Minecraft log files and crash reports.",
      },
      {
        key: "activity.read",
        label: "Activity Log",
        description:
          "Allows viewing the panel activity log (who started, stopped or changed what).",
      },
    ],
  },
  {
    id: "database",
    label: "Database Management",
    permissions: [
      {
        key: "database.read",
        label: "View Databases",
        description:
          "Allows viewing all databases for this server, including usernames and passwords.",
      },
      {
        key: "database.create",
        label: "Create Database",
        description: "Allows creating additional databases for this server.",
      },
      {
        key: "database.update",
        label: "Reset Database Password",
        description: "Allows resetting passwords for databases.",
      },
      {
        key: "database.delete",
        label: "Delete Databases",
        description: "Allows deleting databases for this server from the panel.",
      },
    ],
  },
  {
    id: "file",
    label: "File Management",
    permissions: [
      {
        key: "file.sftp",
        label: "SFTP Allowed",
        description: "Allows connecting via SFTP (when available).",
      },
      {
        key: "file.read",
        label: "List Files",
        description: "Allows listing files and folders on the server.",
      },
      {
        key: "file.read-content",
        label: "Read Files",
        description: "Allows reading file contents in the panel.",
      },
      {
        key: "file.update",
        label: "Save Files",
        description: "Allows saving modified file contents.",
      },
      {
        key: "file.create",
        label: "Create Files",
        description: "Allows creating new files and folders.",
      },
      {
        key: "file.upload",
        label: "Upload Files",
        description: "Allows uploading files via the file manager.",
      },
      {
        key: "file.delete",
        label: "Delete Files",
        description: "Allows deleting files from the server.",
      },
      {
        key: "file.archive",
        label: "Archive Files",
        description: "Allows compressing and decompressing archives.",
      },
      {
        key: "file.download",
        label: "Download Files",
        description: "Allows downloading files from the panel.",
      },
    ],
  },
  {
    id: "backup",
    label: "Backup Management",
    permissions: [
      {
        key: "backup.read",
        label: "View Backups",
        description: "Allows viewing server backups and schedules.",
      },
      {
        key: "backup.create",
        label: "Create Backups",
        description: "Allows creating and uploading backups.",
      },
      {
        key: "backup.delete",
        label: "Delete Backups",
        description: "Allows deleting backups.",
      },
      {
        key: "backup.restore",
        label: "Restore Backups",
        description: "Allows restoring backups onto the server.",
      },
    ],
  },
  {
    id: "schedule",
    label: "Schedule Management",
    permissions: [
      {
        key: "schedule.read",
        label: "List Schedules",
        description: "Allows listing schedules/tasks for this server.",
      },
      {
        key: "schedule.create",
        label: "Create Schedule",
        description: "Allows creating new schedules.",
      },
      {
        key: "schedule.update",
        label: "Edit Schedule",
        description: "Allows editing and toggling schedules.",
      },
      {
        key: "schedule.delete",
        label: "Delete Schedule",
        description: "Allows deleting schedules from the server.",
      },
    ],
  },
  {
    id: "player",
    label: "Player Management",
    permissions: [
      {
        key: "player.read",
        label: "View Players",
        description: "Allows viewing online players, whitelist, ops and bans.",
      },
      {
        key: "player.update",
        label: "Manage Players",
        description: "Allows managing whitelist, ops, bans and player actions.",
      },
    ],
  },
  {
    id: "addon",
    label: "Addon Management",
    permissions: [
      {
        key: "addon.read",
        label: "View Addons",
        description: "Allows viewing installed plugins/mods.",
      },
      {
        key: "addon.update",
        label: "Manage Addons",
        description: "Allows installing and removing plugins/mods.",
      },
    ],
  },
];

export function hasPermission(
  granted: readonly string[] | null | undefined,
  required: ServerPermission | ServerPermission[],
): boolean {
  if (!granted) return false;
  if (granted.includes("*")) return true;
  const need = Array.isArray(required) ? required : [required];
  return need.some((p) => granted.includes(p));
}

/** Wildcard meaning full access (owners / admins). */
export const ALL_PERMISSIONS_WILDCARD = "*" as const;

/** Permission-group ids that a license can enable/disable. */
export const LICENSE_FEATURE_GROUP_IDS = PERMISSION_GROUPS.map((g) => g.id);

export function isLicenseFeatureGroup(id: string): boolean {
  return (LICENSE_FEATURE_GROUP_IDS as readonly string[]).includes(id);
}

/**
 * Normalize license feature groups.
 * `null` = all features enabled (no commercial ceiling).
 * `[]` = nothing enabled.
 */
export function normalizeLicenseFeatures(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const ids = [
    ...new Set(
      raw.filter(
        (x): x is string => typeof x === "string" && isLicenseFeatureGroup(x),
      ),
    ),
  ];
  if (ids.length === LICENSE_FEATURE_GROUP_IDS.length) return null;
  return ids;
}

/** Expand enabled groups to permission keys. `null` features → unrestricted (`null`). */
export function permissionsAllowedByLicenseFeatures(
  features: string[] | null | undefined,
): string[] | null {
  if (features == null) return null;
  const set = new Set(features);
  const out: string[] = [];
  for (const g of PERMISSION_GROUPS) {
    if (!set.has(g.id)) continue;
    for (const p of g.permissions) out.push(p.key);
  }
  return out;
}

/** Clamp granted server permissions to what the license allows. */
export function applyLicenseFeatureCeiling(
  granted: readonly string[],
  features: string[] | null | undefined,
): string[] {
  const allowed = permissionsAllowedByLicenseFeatures(features);
  if (allowed == null) return [...granted];
  if (granted.includes(ALL_PERMISSIONS_WILDCARD)) return [...allowed];
  return granted.filter((p) => allowed.includes(p));
}
