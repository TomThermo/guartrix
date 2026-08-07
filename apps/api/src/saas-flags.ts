/**
 * SaaS / SLA operator flags (env).
 * Keep free of Fastify/Prisma so unit tests stay light.
 */

function truthy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function falsy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/**
 * Multi-API / managed HA posture.
 * When set, Redis + BullMQ are required at boot and Go-live fails without them.
 */
export function requireRedisHa(): boolean {
  return truthy(process.env.REQUIRE_REDIS_HA) || truthy(process.env.PANEL_HA);
}

/**
 * Allow panel tmpdir staging when peer node copy fails.
 * Default **off** — peer MySQL/files only; set `TRANSFER_ALLOW_PANEL_STAGING=1` to opt in.
 */
export function transferAllowPanelStaging(): boolean {
  const raw = process.env.TRANSFER_ALLOW_PANEL_STAGING;
  if (raw === undefined || raw.trim() === "") return false;
  if (falsy(raw)) return false;
  return truthy(raw);
}

/** Aggregate Client API + session budget per owning userId (per minute). 0 = disabled. */
export function apiOwnerRateLimitPerMin(): number {
  const raw = Number(process.env.API_OWNER_RATE_LIMIT ?? 1800);
  if (!Number.isFinite(raw) || raw < 0) return 1800;
  return Math.floor(raw);
}
