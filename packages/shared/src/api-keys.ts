/** Personal Client API keys — shared types. */

import {
  SERVER_PERMISSIONS,
  type ServerPermission,
  isServerPermission,
} from "./permissions.js";

/** Max active (non-revoked) keys per user. */
export const API_KEY_MAX_PER_USER = 10;

/** Default rate limit for Bearer API-key requests (per key, sliding window). */
export const API_KEY_RATE_DEFAULT = 120;
export const API_KEY_RATE_WINDOW_MS = 60_000;

export interface ApiKeyRecord {
  id: string;
  name: string;
  /** Public prefix, e.g. `gt_a1b2c3d4`. */
  prefix: string;
  permissions: string[];
  /** null = all servers the account can access. */
  serverIds: string[] | null;
  /** Panel admin scopes (ADMIN accounts only). null = server routes only. */
  adminScopes: string[] | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiKeyCreateRequest {
  name: string;
  /** Subset of SERVER_PERMISSIONS, or ["*"]. */
  permissions: string[];
  /** Optional allow-list of server ids. Omit / null = all accessible. */
  serverIds?: string[] | null;
  /** Optional panel admin scopes (ADMIN role only). Omit / null = no /api/admin access. */
  adminScopes?: string[] | null;
}

export interface ApiKeyCreateResponse {
  key: ApiKeyRecord;
  /** Plaintext token — shown once. */
  token: string;
}

export interface ApiKeyListResponse {
  keys: ApiKeyRecord[];
  maxKeys: number;
}

/** Validate and normalize a permissions array from the client. */
export function normalizeApiKeyPermissions(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.includes("*")) return ["*"];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    if (!isServerPermission(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : null;
}

/** Common permission presets for the create-key UI. */
export const API_KEY_PRESETS: {
  id: string;
  label: string;
  description: string;
  permissions: ServerPermission[] | ["*"];
}[] = [
  {
    id: "read",
    label: "Read only",
    description: "List servers, read files and settings — no power or writes.",
    permissions: [
      "file.read",
      "file.read-content",
      "file.download",
      "settings.read",
      "startup.read",
      "allocation.read",
      "database.read",
      "backup.read",
      "schedule.read",
      "player.read",
      "addon.read",
      "activity.read",
      "audit.read",
    ],
  },
  {
    id: "control",
    label: "Power + console",
    description: "Start / stop / restart / kill and send console commands.",
    permissions: [
      "control.start",
      "control.stop",
      "control.restart",
      "control.kill",
      "control.console",
    ],
  },
  {
    id: "files",
    label: "Files",
    description: "Read, write, upload and delete server files.",
    permissions: [
      "file.read",
      "file.read-content",
      "file.create",
      "file.update",
      "file.delete",
      "file.upload",
      "file.download",
      "file.archive",
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Read server stats, logs, players, and activity — no writes.",
    permissions: [
      "control.console.read",
      "file.read",
      "settings.read",
      "startup.read",
      "player.read",
      "activity.read",
      "audit.read",
      "backup.read",
      "schedule.read",
      "addon.read",
    ],
  },
  {
    id: "backups",
    label: "Backups",
    description: "List, create, restore, and delete backups.",
    permissions: [
      "backup.read",
      "backup.create",
      "backup.delete",
      "backup.restore",
      "schedule.read",
    ],
  },
  {
    id: "databases",
    label: "Databases",
    description: "Manage per-server MySQL databases.",
    permissions: [
      "database.read",
      "database.create",
      "database.update",
      "database.delete",
    ],
  },
  {
    id: "full",
    label: "Full access",
    description: "Everything this account can do on allowed servers.",
    permissions: ["*"],
  },
];

export { SERVER_PERMISSIONS };
