import Fastify from "fastify";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { BACKUP_UPLOAD_MAX_BYTES } from "@msm/shared";
import { registerOwnershipGuard } from "./auth/auth.js";
import { registerBearerAuthResolver } from "./auth/bearer-resolver.js";
import { registerCsrfGuard, allowedOrigins } from "./auth/csrf.js";
import { registerApiSessionRateLimit } from "./auth/api-rate-limit.js";
import { rewriteApiV1Url } from "./api-v1-rewrite.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { genReqId, logger } from "./logger.js";
import { registerMetrics } from "./metrics.js";
import { registerAccountRoutes } from "./routes/account/index.js";
import { registerAdminRoutes } from "./routes/admin/index.js";
import {
  registerApplicationKeyAdminRoutes,
  registerApplicationRoutes,
} from "./routes/application.js";
import { registerAuthHttpRoutes } from "./routes/auth/index.js";
import { registerBillingRoutes } from "./routes/billing/index.js";
import { registerNodeHttpRoutes } from "./routes/nodes/index.js";
import { registerServerRoutes } from "./routes/servers.js";
import { registerConsoleWs } from "./ws/console.js";
import { registerAdminLogsWs } from "./ws/admin-logs.js";
import { registerPlayersWs } from "./ws/players.js";
import type { PanelSessionStore } from "./auth/session-store.js";

export async function buildApp(sessionStore: PanelSessionStore): Promise<FastifyInstance> {
  const trustProxyEnv =
    process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1" || config.sessionSecure;
  const trustedProxyList = (process.env.TRUSTED_PROXIES || "127.0.0.1,::1,::ffff:127.0.0.1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const trustAllProxies = trustedProxyList.includes("*");
  if (
    trustAllProxies &&
    process.env.ALLOW_INSECURE_TRUST_PROXY !== "1" &&
    process.env.ALLOW_INSECURE_TRUST_PROXY !== "true"
  ) {
    throw new Error(
      "[guartrix] TRUSTED_PROXIES=* re-enables X-Forwarded-For spoofing. " +
        "Set ALLOW_INSECURE_TRUST_PROXY=1 only if every network hop is trusted.",
    );
  }

  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "reqId",
    genReqId,
    bodyLimit: 32 * 1024 * 1024,
    connectionTimeout: 0,
    requestTimeout: 0,
    // Stable public API alias: /api/v1/* → /api/* (same handlers).
    // Must use rewriteUrl — onRequest is too late for the router.
    rewriteUrl: (req) => rewriteApiV1Url(req.url ?? ""),
    // Only honour X-Forwarded-For from known reverse proxies (default: localhost).
    // Prevents spoofed client IPs from bypassing login rate limits if the API
    // is ever reachable beyond prod-web.
    trustProxy: !trustProxyEnv
      ? false
      : trustAllProxies
        ? true
        : (address: string) => {
            const bare = address.replace(/^::ffff:/, "");
            return trustedProxyList.includes(address) || trustedProxyList.includes(bare);
          },
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || body === "") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Mollie payment webhooks POST id=tr_… as form-urlencoded.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const text = typeof body === "string" ? body : String(body ?? "");
        done(null, Object.fromEntries(new URLSearchParams(text)));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins().has(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-CSRF-Token"],
    exposedHeaders: ["Accept-Ranges", "Content-Range", "Content-Length", "X-Request-Id"],
  });
  // Gzip/brotli for JSON and other compressible API responses (skips already-encoded).
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ["br", "gzip"],
  });
  await app.register(cookie);
  await app.register(session, {
    secret: config.sessionSecret,
    store: sessionStore,
    // Avoid rewriting the session file on every poll/GET.
    rolling: false,
    cookie: {
      secure: config.sessionSecure,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  });
  await app.register(websocket);
  await app.register(multipart, {
    limits: {
      fileSize: BACKUP_UPLOAD_MAX_BYTES,
      files: 1,
    },
  });

  registerBearerAuthResolver(app);
  registerCsrfGuard(app);
  registerApiSessionRateLimit(app);
  registerMetrics(app);
  registerAuthHttpRoutes(app);
  registerAccountRoutes(app);
  registerApplicationKeyAdminRoutes(app);
  registerApplicationRoutes(app);
  registerBillingRoutes(app);
  registerOwnershipGuard(app);
  registerNodeHttpRoutes(app);
  registerAdminRoutes(app);
  registerServerRoutes(app);
  registerConsoleWs(app);
  registerAdminLogsWs(app);
  registerPlayersWs(app);

  app.get("/api/health", async () => ({ ok: true }));

  /** Readiness: DB reachable; optionally local daemon when not skipped. */
  app.get("/api/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply.status(503).send({ ok: false, error: "database unavailable" });
    }

    const skipLocal =
      process.env.SKIP_LOCAL_DAEMON === "1" || process.env.SKIP_LOCAL_DAEMON === "true";
    if (!skipLocal) {
      const host = process.env.DAEMON_HOST?.trim() || "127.0.0.1";
      const port = Number(process.env.DAEMON_PORT ?? 8081);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(`http://${host}:${port}/ready`, {
          signal: ctrl.signal,
        }).finally(() => clearTimeout(t));
        if (!res.ok) {
          return reply.status(503).send({ ok: false, error: "local daemon not ready" });
        }
      } catch {
        return reply.status(503).send({ ok: false, error: "local daemon unreachable" });
      }
    }

    return { ok: true };
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const id = request.id;
    if (id && !reply.hasHeader("x-request-id")) {
      void reply.header("x-request-id", String(id));
    }
    return payload;
  });

  return app;
}
