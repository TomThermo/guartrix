/** Application API (admin / billing machine keys) — shared types. */

export const APPLICATION_API_KEY_MAX = 20;
export const APPLICATION_API_RATE_DEFAULT = 120;
export const APPLICATION_API_RATE_WINDOW_MS = 60_000;

/** Scopes for `gta_` Application API keys. */
export const APPLICATION_SCOPES = [
  "users.read",
  "users.write",
  "servers.read",
  "servers.write",
  "plans.read",
  "plans.write",
  "payments.read",
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

export type PaymentStatusValue =
  | "OPEN"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

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
