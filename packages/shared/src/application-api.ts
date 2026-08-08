/** Application API (admin / billing machine keys) — shared types. */

export const APPLICATION_API_KEY_MAX = 20;
export const APPLICATION_API_RATE_DEFAULT = 120;
export const APPLICATION_API_RATE_WINDOW_MS = 60_000;

/** Scopes for `gta_` Application API keys. */
export const APPLICATION_SCOPES = [
  "users.read",
  "users.write",
  "users.delete",
  "servers.read",
  "servers.write",
  "servers.update",
  "servers.power",
  "servers.delete",
  "servers.files",
  "servers.addons",
  "servers.backups",
  "servers.allocations",
  "servers.databases",
  "plans.read",
  "plans.write",
  "payments.read",
  "nodes.read",
  "nodes.write",
  "activity.read",
  "settings.read",
  "settings.write",
] as const;

export type ApplicationScope = (typeof APPLICATION_SCOPES)[number];

export function isApplicationScope(value: string): value is ApplicationScope {
  return (APPLICATION_SCOPES as readonly string[]).includes(value);
}

export function normalizeApplicationScopes(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.includes("*")) return ["*"];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    if (!isApplicationScope(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out.length > 0 ? out : null;
}

export interface ApplicationApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  note: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApplicationApiKeyCreateRequest {
  name: string;
  scopes: string[];
  note?: string | null;
}

export interface ApplicationApiKeyCreateResponse {
  key: ApplicationApiKeyRecord;
  /** Plaintext token — shown once. */
  token: string;
}

/** Presets for Application API key scopes (admin UI / docs). */
export const APPLICATION_API_PRESETS: {
  id: string;
  label: string;
  description: string;
  scopes: ApplicationScope[] | ["*"];
}[] = [
  {
    id: "billing",
    label: "Billing automation",
    description:
      "Manage users, servers, plans, payments, and day-to-day server ops (files, addons, backups).",
    scopes: [
      "users.read",
      "users.write",
      "servers.read",
      "servers.write",
      "servers.update",
      "servers.power",
      "servers.files",
      "servers.addons",
      "servers.backups",
      "servers.allocations",
      "servers.databases",
      "plans.read",
      "payments.read",
    ],
  },
  {
    id: "readonly",
    label: "Read-only",
    description: "List users, servers, nodes, plans, payments, and activity.",
    scopes: [
      "users.read",
      "servers.read",
      "nodes.read",
      "plans.read",
      "payments.read",
      "activity.read",
      "settings.read",
    ],
  },
  {
    id: "provisioning",
    label: "Provisioning",
    description: "Create users and servers, update quotas.",
    scopes: ["users.read", "users.write", "servers.read", "servers.write", "plans.read"],
  },
  {
    id: "server-ops",
    label: "Server operations",
    description: "Power, files, addons, backups, network, and databases for any server.",
    scopes: [
      "servers.read",
      "servers.power",
      "servers.files",
      "servers.addons",
      "servers.backups",
      "servers.allocations",
      "servers.databases",
    ],
  },
  {
    id: "full",
    label: "Full Application API",
    description: "All Application API scopes.",
    scopes: ["*"],
  },
];

export interface PlanTemplateRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  maxServers: number;
  maxMemoryMb: number;
  maxDatabases: number;
  defaultMemoryMb: number;
  defaultDiskMb: number;
  autoCreateServer: boolean;
  defaultServerType: string;
  defaultMcVersion: string;
  /** Mollie interval e.g. "1 month", or null for one-off. */
  recurringInterval: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatusValue = "OPEN" | "PENDING" | "PAID" | "FAILED" | "CANCELED" | "EXPIRED";

export interface PaymentRecord {
  id: string;
  mollieId: string | null;
  userId: string;
  username?: string | null;
  planId: string | null;
  planSlug?: string | null;
  planName?: string | null;
  status: PaymentStatusValue;
  amountCents: number;
  currency: string;
  description: string;
  checkoutUrl: string | null;
  provisioned: boolean;
  provisionedAt: string | null;
  subscriptionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCheckoutRequest {
  planSlug: string;
  /** Optional override redirect after Mollie (defaults to /account/billing). */
  redirectUrl?: string;
}

export interface CreateCheckoutResponse {
  payment: PaymentRecord;
  /** Mollie hosted checkout URL — send the customer here. */
  checkoutUrl: string;
}

export interface MollieStatusResponse {
  configured: boolean;
  /** true when MOLLIE_API_KEY starts with test_ */
  testMode: boolean;
}

export interface BillingSubscriptionRecord {
  id: string;
  planId: string | null;
  planSlug: string | null;
  planName: string | null;
  interval: string;
  amountCents: number;
  currency: string;
  status: string;
  mollieSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
  canceledAt: string | null;
}
