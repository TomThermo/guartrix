import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";

export function allowedOrigins(): Set<string> {
  const host = config.publicHost;
  return new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://localhost",
    "https://127.0.0.1",
    "https://localhost",
    `http://${host}`,
    `http://${host}:80`,
    `http://${host}:5173`,
    `https://${host}`,
    `https://${host}:443`,
    config.publicBaseUrl.replace(/\/$/, ""),
  ]);
}

/**
 * Same-origin check for cookie-authenticated mutating requests.
 * Browsers send Origin (or Referer) on cross-site POSTs; reject strangers.
 * Missing Origin and Referer is rejected unless CSRF_ALLOW_MISSING_ORIGIN=1
 * (local curl debugging). Prefer Bearer API keys for non-browser clients.
 */
export function assertSameOrigin(request: FastifyRequest): string | null {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    if (!allowedOrigins().has(origin)) {
      return "Invalid origin";
    }
    return null;
  }
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer.length > 0) {
    try {
      const u = new URL(referer);
      const refOrigin = `${u.protocol}//${u.host}`;
      if (!allowedOrigins().has(refOrigin)) {
        return "Invalid referer";
      }
      return null;
    } catch {
      return "Invalid referer";
    }
  }
  if (process.env.CSRF_ALLOW_MISSING_ORIGIN === "1") {
    return null;
  }
  return "Missing origin";
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfExemptPath(pathname: string): boolean {
  if (pathname === "/api/health" || pathname === "/api/ready") return true;
  if (pathname === "/api/metrics" || pathname === "/metrics") return true;
  if (pathname.startsWith("/api/internal/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  return false;
}

/**
 * Apply Origin/Referer checks to all cookie-auth mutating /api routes.
 * Daemon/internal bearer routes and public GETs are skipped.
 */
export function registerCsrfGuard(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    if (!MUTATING.has(request.method)) return;
    const pathOnly = request.url.split("?")[0] ?? "";
    if (!pathOnly.startsWith("/api/")) return;
    if (csrfExemptPath(pathOnly)) return;
    // Daemon/node machine clients use Bearer — not browser cookie CSRF.
    const auth = request.headers.authorization;
    if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) return;

    const err = assertSameOrigin(request);
    if (err) {
      return reply.status(403).send({ error: err });
    }
  });
}
