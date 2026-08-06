/** Panel admin scopes for personal `gt_` keys (ADMIN accounts only). */

export const ADMIN_PANEL_SCOPES = [
  "admin.full",
  "users.read",
  "users.write",
  "users.delete",
  "nodes.read",
  "nodes.write",
  "settings.read",
  "settings.write",
  "activity.read",
  "status.read",
  "billing.read",
  "billing.write",
  "license.read",
  "license.write",
] as const;

export type AdminPanelScope = (typeof ADMIN_PANEL_SCOPES)[number];

export function isAdminPanelScope(value: string): value is AdminPanelScope {
  return (ADMIN_PANEL_SCOPES as readonly string[]).includes(value);
}

export function normalizeAdminPanelScopes(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.includes("*")) return ["*"];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    if (!isAdminPanelScope(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : null;
}

export function adminPanelHasScope(
  scopes: readonly string[],
  required: AdminPanelScope | "admin.full",
): boolean {
  if (scopes.includes("*")) return true;
  if (scopes.includes("admin.full")) return true;
  if (required === "admin.full") return false;
  return scopes.includes(required);
}

/** UI / docs presets for admin-scoped Client API keys. */
export const ADMIN_PANEL_PRESETS: {
  id: string;
  label: string;
  description: string;
  adminScopes: AdminPanelScope[] | ["*"];
}[] = [
  {
    id: "admin-readonly",
    label: "Admin read-only",
    description: "List users, nodes, activity, and status — no writes.",
    adminScopes: ["users.read", "nodes.read", "activity.read", "status.read", "billing.read"],
  },
  {
    id: "admin-users",
    label: "User management",
    description: "Create and update panel accounts and quotas.",
    adminScopes: ["users.read", "users.write"],
  },
  {
    id: "admin-nodes",
    label: "Node management",
    description: "View and configure daemon nodes.",
    adminScopes: ["nodes.read", "nodes.write"],
  },
  {
    id: "admin-full",
    label: "Full panel admin",
    description: "All panel admin routes (same power as an admin session).",
    adminScopes: ["*"],
  },
];
