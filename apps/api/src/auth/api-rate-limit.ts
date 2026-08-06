import type { FastifyInstance, FastifyRequest } from "fastify";
import { getRateLimitStore } from "../rate-limit-store.js";

const WINDOW_MS = 60_000;
const MAX = Number(process.env.API_SESSION_RATE_LIMIT ?? 600);

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
): string | null {
  if (!session?.authenticated) return null;
  const userId = session.userId?.trim();
  if (userId) return `api-session:user:${userId}`;
  return `api-session:ip:${ip || "unknown"}`;
}

/** Soft cap on authenticated cookie-session API traffic per user. */
export function registerApiSessionRateLimit(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    if (isExempt(request)) return;
    if (!Number.isFinite(MAX) || MAX <= 0) return;

    const session = request.session as {
      authenticated?: boolean;
      userId?: string;
    };
    const key = sessionRateLimitKey(session, request.ip || "unknown");
    if (!key) return;

    const rl = await getRateLimitStore().hit(key, WINDOW_MS, MAX);
    if (rl.limited) {
      return reply.status(429).send({ error: "Too many API requests — slow down" });
    }
  });
}
