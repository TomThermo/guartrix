import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";

export const CSRF_HEADER = "x-csrf-token";

type SessionWithCsrf = {
  csrfToken?: string;
  authenticated?: boolean;
};

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

/** Issue or return the per-session CSRF secret (double-submit header). */
export function issueSessionCsrfToken(session: SessionWithCsrf): string {
  if (session.csrfToken) return session.csrfToken;
  const token = randomBytes(32).toString("base64url");
  session.csrfToken = token;
  return token;
}

export function assertCsrfToken(request: FastifyRequest): string | null {
  const session = request.session as SessionWithCsrf;
  if (!session?.csrfToken) {
    return "Missing CSRF token — refresh the page";
  }
  const raw = request.headers[CSRF_HEADER];
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token || token !== session.csrfToken) {
    return "Invalid CSRF token";
  }
  return null;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfExemptPath(pathname: string): boolean {
  if (pathname === "/api/health" || pathname === "/api/ready") return true;
  if (pathname === "/api/metrics" || pathname === "/metrics") return true;
  if (pathname.startsWith("/api/internal/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  return false;
}

/** Auth routes that establish a session before a CSRF token exists. */
function csrfTokenExemptPath(pathname: string): boolean {
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/login/2fa") return true;
  if (pathname === "/api/auth/register") return true;
  if (pathname === "/api/auth/forgot-password") return true;
  if (pathname === "/api/auth/reset-password") return true;
  if (pathname === "/api/auth/verify-email") return true;
  return false;
}

/**
 * Apply Origin/Referer + CSRF token checks to cookie-auth mutating /api routes.
 * Daemon/internal bearer routes and public endpoints are skipped.
 */
export function registerCsrfGuard(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    if (!MUTATING.has(request.method)) return;
    const pathOnly = request.url.split("?")[0] ?? "";
    if (!pathOnly.startsWith("/api/")) return;
    if (csrfExemptPath(pathOnly)) return;
    // Only skip CSRF when a real API/Application key resolved — not a junk Bearer
    // that would leave cookie session in charge without Origin/CSRF checks.
    if (request.apiKeyAuth || request.applicationAuth) return;

    const originErr = assertSameOrigin(request);
    if (originErr) {
      return reply.status(403).send({ error: originErr });
    }

    if (csrfTokenExemptPath(pathOnly)) return;

    const session = request.session as SessionWithCsrf;
    if (session?.authenticated) {
      const csrfErr = assertCsrfToken(request);
      if (csrfErr) {
        return reply.status(403).send({ error: csrfErr });
      }
    }
  });
}
