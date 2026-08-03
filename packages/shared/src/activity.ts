/** Panel activity log (audit trail) — shared action registry and types. */

export const ACTIVITY_CATEGORIES = [
  "power",
  "console",
  "settings",
  "file",
  "backup",
  "database",
  "allocation",
  "schedule",
  "subuser",
  "player",
  "addon",
  "server",
  "auth",
  "admin",
  "node",
  "billing",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export interface ActivityCategoryMeta {
  id: ActivityCategory;
  label: string;
  icon: string;
}

export const ACTIVITY_CATEGORY_META: ActivityCategoryMeta[] = [
  { id: "power", label: "Power", icon: "fa-power-off" },
  { id: "console", label: "Console", icon: "fa-terminal" },
  { id: "settings", label: "Settings", icon: "fa-sliders" },
  { id: "file", label: "Files", icon: "fa-folder-open" },
  { id: "backup", label: "Backups", icon: "fa-box-archive" },
  { id: "database", label: "Databases", icon: "fa-database" },
  { id: "allocation", label: "Network", icon: "fa-ethernet" },
  { id: "schedule", label: "Schedules", icon: "fa-clock" },
  { id: "subuser", label: "Subusers", icon: "fa-user-group" },
  { id: "player", label: "Players", icon: "fa-user" },
  { id: "addon", label: "Addons", icon: "fa-puzzle-piece" },
  { id: "server", label: "Server", icon: "fa-server" },
  { id: "auth", label: "Account", icon: "fa-right-to-bracket" },
  { id: "admin", label: "Admin", icon: "fa-users-gear" },
  { id: "node", label: "Nodes", icon: "fa-hard-drive" },
  { id: "billing", label: "Billing", icon: "fa-credit-card" },
];

export interface ActivityActionMeta {
  category: ActivityCategory;
  label: string;
  /** Notify webhooks/email when this happens (crashes, offline, security). */
  critical?: boolean;
}

/**
 * Every action the panel records. Keys are stable strings stored in the DB —
 * rename with care, old rows keep the old key.
 */
export const ACTIVITY_ACTIONS: Record<string, ActivityActionMeta> = {
  // Power
  "server.start": { category: "power", label: "Started the server" },
  "server.stop": { category: "power", label: "Stopped the server" },
  "server.restart": { category: "power", label: "Restarted the server" },
  "server.kill": { category: "power", label: "Killed the server process" },
  "server.crashed": {
    category: "power",
    label: "Server crashed",
    critical: true,
  },
  "server.oom": {
    category: "power",
    label: "Server ran out of memory (OOM)",
    critical: true,
  },
  "server.disk_high": {
    category: "server",
    label: "Server disk usage is high",
    critical: true,
  },
  "server.offline": {
    category: "power",
    label: "Server went offline unexpectedly",
    critical: true,
  },
  "server.crash_loop": {
    category: "power",
    label: "Server crash-loop — auto-restart stopped",
    critical: true,
  },

  // Console
  "console.command": { category: "console", label: "Sent a console command" },

  // Server lifecycle / settings
  "server.create": { category: "server", label: "Created the server" },
  "server.delete": { category: "server", label: "Deleted the server" },
  "server.clone": { category: "server", label: "Cloned the server" },
  "server.transfer": {
    category: "server",
    label: "Moved the server to another node",
    critical: true,
  },
  "server.import": { category: "server", label: "Imported a server" },
  "server.reinstall": { category: "server", label: "Reinstalled the server" },
  "server.version-change": { category: "server", label: "Changed the version" },
  "server.type-change": { category: "server", label: "Changed the server software" },
  "server.world-reset": { category: "server", label: "Reset the world" },
  "server.world-import": { category: "server", label: "Imported a world" },
  "server.world-seed": { category: "server", label: "Queried the world seed" },
  "license.expired": {
    category: "admin",
    label: "License expired — game servers stopped",
    critical: true,
  },
  "license.removed": {
    category: "admin",
    label: "Removed the license key",
    critical: true,
  },
  "server.owner-change": {
    category: "server",
    label: "Changed the server owner",
    critical: true,
  },
  "settings.update": { category: "settings", label: "Updated settings" },
  "settings.properties": { category: "settings", label: "Updated server.properties" },
  "settings.startup": { category: "settings", label: "Updated startup settings" },
  "settings.icon": { category: "settings", label: "Changed the server icon" },
  "settings.resource-pack": { category: "settings", label: "Changed the resource pack" },
  "settings.engine": { category: "settings", label: "Updated engine settings" },

  // Files
  "file.write": { category: "file", label: "Saved a file" },
  "file.create": { category: "file", label: "Created a file" },
  "file.create-directory": { category: "file", label: "Created a folder" },
  "file.delete": { category: "file", label: "Deleted files" },
  "file.rename": { category: "file", label: "Renamed a file" },
  "file.copy": { category: "file", label: "Copied a file" },
  "file.upload": { category: "file", label: "Uploaded files" },
  "file.download": { category: "file", label: "Downloaded a file" },
  "file.compress": { category: "file", label: "Created an archive" },
  "file.decompress": { category: "file", label: "Extracted an archive" },
  "file.sftp-login": { category: "file", label: "Signed in over SFTP" },

  // Backups
  "backup.create": { category: "backup", label: "Created a backup" },
  "backup.delete": { category: "backup", label: "Deleted a backup" },
  "backup.restore": {
    category: "backup",
    label: "Restored a backup",
    critical: true,
  },
  "backup.upload": { category: "backup", label: "Uploaded a backup" },
  "backup.download": { category: "backup", label: "Downloaded a backup" },
  "backup.schedule": { category: "backup", label: "Updated the backup schedule" },
  "backup.failed": { category: "backup", label: "Backup failed", critical: true },

  // Databases
  "database.create": { category: "database", label: "Created a database" },
  "database.delete": { category: "database", label: "Deleted a database" },

  // Allocations
  "allocation.assign": { category: "allocation", label: "Assigned a port" },
  "allocation.unassign": { category: "allocation", label: "Released a port" },
  "allocation.primary": { category: "allocation", label: "Changed the primary port" },
  "allocation.update": { category: "allocation", label: "Updated a port" },
  "allocation.pool-create": { category: "allocation", label: "Added ports to the node pool" },
  "allocation.pool-delete": { category: "allocation", label: "Removed ports from the node pool" },

  // Schedules
  "schedule.create": { category: "schedule", label: "Created a schedule" },
  "schedule.update": { category: "schedule", label: "Updated a schedule" },
  "schedule.delete": { category: "schedule", label: "Deleted a schedule" },
  "schedule.run": { category: "schedule", label: "Ran a schedule" },

  // Subusers
  "subuser.create": { category: "subuser", label: "Invited a subuser" },
  "subuser.update": { category: "subuser", label: "Changed subuser permissions" },
  "subuser.delete": { category: "subuser", label: "Removed a subuser" },

  // Players
  "player.kick": { category: "player", label: "Kicked a player" },
  "player.ban": { category: "player", label: "Banned a player" },
  "player.unban": { category: "player", label: "Unbanned a player" },
  "player.op": { category: "player", label: "Opped a player" },
  "player.deop": { category: "player", label: "De-opped a player" },
  "player.whitelist-add": { category: "player", label: "Whitelisted a player" },
  "player.whitelist-remove": { category: "player", label: "Removed from whitelist" },
  "player.action": { category: "player", label: "Ran a player action" },

  // Addons
  "addon.install": { category: "addon", label: "Installed an addon" },
  "addon.modpack": { category: "addon", label: "Installed a modpack" },
  "addon.geyser": { category: "addon", label: "Installed Geyser (Bedrock)" },
  "addon.sync": {
    category: "addon",
    label: "Synced installed addons from disk",
  },
  "addon.delete": { category: "addon", label: "Removed an addon" },

  // Account / auth
  "auth.login": { category: "auth", label: "Signed in" },
  "auth.login-failed": {
    category: "auth",
    label: "Failed sign-in attempt",
    critical: true,
  },
  "auth.logout": { category: "auth", label: "Signed out" },
  "auth.register": { category: "auth", label: "Registered an account" },
  "auth.email-verified": { category: "auth", label: "Verified their email" },
  "auth.password-reset-request": { category: "auth", label: "Requested a password reset" },
  "auth.password-reset": {
    category: "auth",
    label: "Reset their password",
    critical: true,
  },
  "auth.2fa-enabled": { category: "auth", label: "Enabled two-factor auth" },
  "auth.2fa-disabled": {
    category: "auth",
    label: "Disabled two-factor auth",
    critical: true,
  },
  "auth.2fa-recovery-used": {
    category: "auth",
    label: "Signed in with a recovery code",
    critical: true,
  },
  "auth.2fa-recovery-regenerated": {
    category: "auth",
    label: "Regenerated recovery codes",
  },
  "auth.2fa-reset": {
    category: "admin",
    label: "Reset a user's two-factor auth",
    critical: true,
  },
  "api-key.create": { category: "auth", label: "Created an API key" },
  "api-key.revoke": {
    category: "auth",
    label: "Revoked an API key",
    critical: true,
  },
  "app-password.create": {
    category: "auth",
    label: "Created an SFTP app password",
  },
  "app-password.revoke": {
    category: "auth",
    label: "Revoked an SFTP app password",
    critical: true,
  },
  "application-key.create": {
    category: "admin",
    label: "Created an Application API key",
    critical: true,
  },
  "application-key.revoke": {
    category: "admin",
    label: "Revoked an Application API key",
    critical: true,
  },

  // Billing / Mollie
  "billing.checkout": { category: "billing", label: "Started a Mollie checkout" },
  "billing.paid": {
    category: "billing",
    label: "Payment marked paid",
    critical: true,
  },
  "billing.provisioned": {
    category: "billing",
    label: "Applied plan quotas after payment",
    critical: true,
  },
  "billing.subscription-created": {
    category: "billing",
    label: "Created a Mollie subscription",
  },
  "billing.failed": {
    category: "billing",
    label: "Payment failed or expired",
    critical: true,
  },
  "billing.subscription-canceled": {
    category: "billing",
    label: "Subscription canceled",
  },
  "billing.revoked": {
    category: "billing",
    label: "Plan quotas revoked after failed renewal",
    critical: true,
  },
  "plan.create": { category: "billing", label: "Created a plan template" },
  "plan.update": { category: "billing", label: "Updated a plan template" },
  "plan.delete": { category: "billing", label: "Deleted a plan template" },

  // Admin
  "user.create": { category: "admin", label: "Created a user" },
  "user.update": { category: "admin", label: "Updated a user" },
  "user.delete": { category: "admin", label: "Deleted a user", critical: true },
  "user.role-change": {
    category: "admin",
    label: "Changed a user role",
    critical: true,
  },

  // Nodes
  "node.create": { category: "node", label: "Added a node" },
  "node.update": { category: "node", label: "Updated a node" },
  "node.delete": { category: "node", label: "Removed a node", critical: true },
  "node.token-rotate": {
    category: "node",
    label: "Rotated a node token",
    critical: true,
  },
  "node.offline": { category: "node", label: "Node went offline", critical: true },
  "node.online": { category: "node", label: "Node came back online" },
};

/** Metadata for an action key, with a readable fallback for unknown keys. */
export function activityActionMeta(action: string): ActivityActionMeta {
  const known = ACTIVITY_ACTIONS[action];
  if (known) return known;
  const prefix = action.split(".")[0] ?? "";
  const category = (ACTIVITY_CATEGORIES as readonly string[]).includes(prefix)
    ? (prefix as ActivityCategory)
    : "server";
  return { category, label: action };
}

export function activityCategoryLabel(category: string): string {
  return ACTIVITY_CATEGORY_META.find((c) => c.id === category)?.label ?? category;
}

export function activityCategoryIcon(category: string): string {
  return ACTIVITY_CATEGORY_META.find((c) => c.id === category)?.icon ?? "fa-circle-info";
}

export interface ActivityEventRecord {
  id: string;
  action: string;
  category: ActivityCategory;
  /** Human label for `action` (server-rendered so old keys stay readable). */
  label: string;
  serverId: string | null;
  serverName: string | null;
  userId: string | null;
  /** Username at event time, or "system"/"scheduler". */
  actorName: string;
  actorIp: string | null;
  success: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityListResponse {
  events: ActivityEventRecord[];
  total: number;
  offset: number;
  limit: number;
  /** How long events are kept (0 = forever). */
  retentionDays: number;
}

export interface ActivityQuery {
  offset?: number;
  limit?: number;
  category?: string;
  action?: string;
  /** Free-text match on actor, server name and metadata. */
  q?: string;
  serverId?: string;
  userId?: string;
}

/** Max page size accepted by the activity endpoints. */
export const ACTIVITY_PAGE_MAX = 100;
export const ACTIVITY_PAGE_DEFAULT = 25;

/** Short one-line summary of an event's metadata for table rows. */
export function activityDetail(event: ActivityEventRecord): string {
  const meta = event.metadata;
  if (!meta) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${key}: ${value.slice(0, 4).join(", ")}${value.length > 4 ? "…" : ""}`);
      continue;
    }
    if (typeof value === "object") continue;
    parts.push(`${key}: ${String(value)}`);
  }
  return parts.join(" · ");
}
