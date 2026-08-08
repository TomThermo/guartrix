import type { FastifyInstance, FastifyRequest } from "fastify";

const buckets = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = Number(process.env.DAEMON_RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX = Number(process.env.DAEMON_RATE_LIMIT_MAX ?? 600);

function rateLimitKey(request: FastifyRequest): string {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return `token:${auth.slice(7, 24)}`;
  }
  return `ip:${request.ip || "unknown"}`;
}

function isExempt(path: string): boolean {
  return (
    path === "/health" || path === "/ready" || path === "/metrics" || path.startsWith("/health?")
  );
}

/** Per-IP / per-token request cap on daemon HTTP routes. */
export function registerDaemonRateLimit(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0] ?? "";
    if (isExempt(pathOnly)) return;
    if (!Number.isFinite(MAX) || MAX <= 0) return;

    const now = Date.now();
    const key = rateLimitKey(request);
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > MAX) {
      return reply.status(429).send({ error: "Too many daemon requests" });
    }
  });
}
