import type { FastifyInstance, FastifyRequest } from "fastify";
import { getRateLimitStore } from "../rate-limit-store.js";

const WINDOW_MS = 60_000;
const MAX = Number(process.env.API_SESSION_RATE_LIMIT ?? 600);

function isExempt(request: FastifyRequest): boolean {
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

/** Soft cap on authenticated cookie-session API traffic per IP. */
export function registerApiSessionRateLimit(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    if (isExempt(request)) return;
    if (!Number.isFinite(MAX) || MAX <= 0) return;

    const session = request.session as { authenticated?: boolean };
    if (!session?.authenticated) return;

    const ip = request.ip || "unknown";
    const rl = await getRateLimitStore().hit(
      `api-session:${ip}`,
      WINDOW_MS,
      MAX,
    );
    if (rl.limited) {
      return reply.status(429).send({ error: "Too many API requests — slow down" });
    }
  });
}
