import type { FastifyInstance, FastifyRequest } from "fastify";
import { rateLimitedError } from "../http-error.js";
import { getRateLimitStore } from "../rate-limit-store.js";
import { checkOwnerApiRate } from "./owner-rate-limit.js";

const WINDOW_MS = 60_000;
const MAX = Number(process.env.API_SESSION_RATE_LIMIT ?? 600);
/** Higher budget for dashboard/list poll GETs so they do not starve mutations. */
const READ_MAX = Number(
  process.env.API_SESSION_READ_RATE_LIMIT ??
    (Number.isFinite(MAX) && MAX > 0 ? Math.max(MAX * 3, 1800) : 1800),
);

/** Paths / auth modes that skip the cookie-session rate limit. */
export function isApiSessionRateLimitExempt(request: FastifyRequest): boolean {
  const path = request.url.split("?")[0] ?? "";
  if (!path.startsWith("/api/")) return true;
  if (path === "/api/health" || path === "/api/ready" || path === "/api/metrics") {
    return true;
  }
  if (path.startsWith("/api/public/")) return true;
  if (path.startsWith("/api/internal/")) return true;
  // Real gt_/gta_ keys use their own counters; junk Bearer must not exempt cookie sessions.
  if (request.apiKeyAuth || request.applicationAuth) return true;
  return false;
}

/**
 * High-churn UI poll GETs (dashboard / console charts).
 * Counted under API_SESSION_READ_RATE_LIMIT so they do not eat the mutation budget.
 */
export function isApiSessionReadPoll(request: FastifyRequest): boolean {
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;
  const path = request.url.split("?")[0] ?? "";
  if (
    path === "/api/servers" ||
    path === "/api/servers/stats" ||
    path === "/api/servers/online" ||
    path === "/api/servers/updates" ||
    path === "/api/servers/addon-updates"
  ) {
    return true;
  }
  // /api/servers/:id/stats and .../stats/history
  if (/^\/api\/servers\/[^/]+\/stats(\/history)?$/.test(path)) return true;
  if (/^\/api\/servers\/[^/]+\/online$/.test(path)) return true;
  return false;
}

function isExempt(request: FastifyRequest): boolean {
  return isApiSessionRateLimitExempt(request);
}

/**
 * Rate-limit bucket key for cookie sessions.
 * Prefer userId so NAT / shared egress does not false-positive 429s across users.
 * Fall back to IP only when the session has no userId (should be rare).
 */
export function sessionRateLimitKey(
  session: { authenticated?: boolean; userId?: string },
  ip: string,
  kind: "all" | "read" = "all",
): string | null {
  if (!session?.authenticated) return null;
  const userId = session.userId?.trim();
  const prefix = kind === "read" ? "api-session-read" : "api-session";
  if (userId) return `${prefix}:user:${userId}`;
  return `${prefix}:ip:${ip || "unknown"}`;
}

/** Soft cap on authenticated cookie-session API traffic per user. */
export function registerApiSessionRateLimit(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    if (isExempt(request)) return;

    const session = request.session as {
      authenticated?: boolean;
      userId?: string;
    };
    const ip = request.ip || "unknown";

    const ownerId = session.userId?.trim();
    if (ownerId) {
      const ownerLimited = await checkOwnerApiRate(ownerId);
      if (ownerLimited) {
        return reply.status(429).send(rateLimitedError(ownerLimited));
      }
    }

    if (isApiSessionReadPoll(request)) {
      if (!Number.isFinite(READ_MAX) || READ_MAX <= 0) return;
      const readKey = sessionRateLimitKey(session, ip, "read");
      if (!readKey) return;
      const rl = await getRateLimitStore().hit(readKey, WINDOW_MS, READ_MAX);
      if (rl.limited) {
        return reply.status(429).send(rateLimitedError("Too many API requests — slow down"));
      }
      return;
    }

    if (!Number.isFinite(MAX) || MAX <= 0) return;
    const key = sessionRateLimitKey(session, ip, "all");
    if (!key) return;

    const rl = await getRateLimitStore().hit(key, WINDOW_MS, MAX);
    if (rl.limited) {
      return reply.status(429).send(rateLimitedError("Too many API requests — slow down"));
    }
  });
}
