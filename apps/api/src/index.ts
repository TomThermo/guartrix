import dns from "node:dns";
import fs from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";

// Prefer IPv4 for outbound HTTPS (Modrinth/Cloudflare). Broken IPv6 on the host
// makes undici fetch hang until timeout while curl -4 works fine.
dns.setDefaultResultOrder("ipv4first");
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { ensureBootstrapAdmin, registerOwnershipGuard } from "./auth/auth.js";
import { registerBearerAuthResolver } from "./auth/bearer-resolver.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCsrfGuard, allowedOrigins } from "./auth/csrf.js";
import { registerApiSessionRateLimit } from "./auth/api-rate-limit.js";
import { config } from "./config.js";
import { loadAndApplyPanelSettings } from "./panel-settings.js";
import { prisma } from "./db.js";
import { migrateLegacyBrandFiles } from "./brand-migrate.js";
import { processManager } from "./servers/process-manager.js";
import { runDueBackupSchedules } from "./servers/backups.js";
import {
  migrateAllScheduledTasksFromJson,
  runDueScheduledTasks,
} from "./servers/scheduled-tasks.js";
import { createSessionStore, ensureSessionDir } from "./auth/session-store.js";
import {
  createRateLimitStore,
  setActiveRateLimitStore,
} from "./rate-limit-store.js";
import { pruneActivityLog } from "./activity-log.js";
import { startActivityWatch } from "./activity-watch.js";
import { startDiscordStatusWorker } from "./discord-status.js";
import { startDiskWatch } from "./servers/disk-watch.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerAccountApiRoutes } from "./routes/account-api.js";
import { registerAccountGdprRoutes } from "./routes/account-gdpr.js";
import { registerAccountPushRoutes } from "./routes/account-push.js";
import { registerTwoFactorRoutes, registerTwoFactorGuard } from "./routes/two-factor.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerAppPasswordRoutes } from "./routes/app-passwords.js";
import {
  registerApplicationKeyAdminRoutes,
  registerApplicationRoutes,
} from "./routes/application.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerAllocationRoutes } from "./routes/allocations.js";
import { registerBackupRoutes } from "./routes/backups.js";
import { registerBotRoutes } from "./routes/bots.js";
import { registerDatabaseRoutes } from "./routes/databases.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerIconRoutes } from "./routes/icon.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerLogRoutes } from "./routes/logs.js";
import { registerNodeRoutes } from "./routes/nodes.js";
import { registerPlayerActionRoutes } from "./routes/player-actions.js";
import { registerResourcePackRoutes } from "./routes/resource-pack.js";
import { registerSftpAuthRoutes } from "./routes/sftp-auth.js";
import { registerServerRoutes } from "./routes/servers.js";
import { registerLicenseRoutes } from "./routes/license.js";
import { registerAdminSettingsRoutes } from "./routes/admin-settings.js";
import { registerStatusRoutes } from "./routes/status.js";
import { registerSubUserRoutes } from "./routes/subusers.js";
import { registerInviteRoutes } from "./routes/invites.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerConsoleWs } from "./ws/console.js";
import { registerAdminLogsWs } from "./ws/admin-logs.js";
import { registerPlayersWs } from "./ws/players.js";
import { botManager } from "./bots/bot-manager-proxy.js";
import { BACKUP_UPLOAD_MAX_BYTES } from "@msm/shared";
import { ensureLocalNode } from "./nodes/nodes.js";
import {
  setNodeToken,
  loadPersistedNodeTokens,
  daemonCleanupContainers,
  daemonIsRunning,
} from "./nodes/daemon-client.js";
import {
  startDaemonEventBridge,
  stopDaemonEventBridge,
} from "./nodes/daemon-events.js";
import { genReqId, logger } from "./logger.js";
import { registerMetrics } from "./metrics.js";
import type { FastifyBaseLogger } from "fastify";

async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[guartrix] Sentry init skipped: ${msg}`);
  }
}

async function main() {
  await initSentry();
  await fs.mkdir(path.join(config.dataDir, "servers"), { recursive: true });
  await fs.mkdir(path.join(config.dataDir, "backups"), { recursive: true });
  loadAndApplyPanelSettings();
  await migrateLegacyBrandFiles();
  const sessionsDir = path.join(config.dataDir, "sessions");
  ensureSessionDir(sessionsDir);
  const sessionStore = await createSessionStore(sessionsDir);
  const { setActiveSessionStore } = await import("./auth/session-store.js");
  setActiveSessionStore(sessionStore);
  setActiveRateLimitStore(await createRateLimitStore(config.dataDir));
  await ensureBootstrapAdmin();

  // multi-node: restore all node tokens, then refresh/ensure the local daemon token.
  const restored = loadPersistedNodeTokens();
  if (restored > 0) {
    logger.info({ restored }, "Restored daemon token(s) from vault");
  }
  const skipLocalDaemon =
    process.env.SKIP_LOCAL_DAEMON === "1" ||
    process.env.SKIP_LOCAL_DAEMON === "true";
  let localNodeId: string | null = null;
  if (skipLocalDaemon) {
    logger.info(
      "SKIP_LOCAL_DAEMON=1 — not creating/starting a local daemon node (use remote nodes)",
    );
  } else {
    const { nodeId, token } = await ensureLocalNode();
    localNodeId = nodeId;
    setNodeToken(nodeId, token);
  }

  try {
    const {
      migratePrimaryAllocations,
      migrateBedrockAllocationProtocols,
      migrateBdsBootProperties,
    } = await import("./servers/allocations.js");
    const n = await migratePrimaryAllocations();
    if (n > 0) {
      logger.info({ count: n }, "Backfilled primary allocation(s)");
    }
    const bedrock = await migrateBedrockAllocationProtocols();
    if (bedrock > 0) {
      logger.info(
        { count: bedrock },
        "Fixed Bedrock primary allocation protocol(s)",
      );
    }
    const bdsBoot = await migrateBdsBootProperties();
    if (bdsBoot > 0) {
      logger.info({ count: bdsBoot }, "Restored BDS online-mode for Xbox auth");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Allocation migration skipped");
  }

  try {
    const n = await migrateAllScheduledTasksFromJson();
    if (n > 0) {
      logger.info({ count: n }, "Migrated scheduled task(s) from JSON to DB");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Scheduled-task JSON migration skipped");
  }

  // Reconcile status with reality instead of blindly marking everything
  // STOPPED. A server whose container is still actually running (e.g. after
  // an API/daemon restart, deploy, or watchdog-triggered restart) must stay
  // RUNNING — otherwise the panel would falsely report the server as down
  // on every single restart of the panel itself.
  const maybeStale = await prisma.server.findMany({
    where: { status: { in: ["RUNNING", "STARTING", "STOPPING"] } },
    select: { id: true },
  });
  // Parallel reconcile with bounded concurrency (was sequential per server).
  const RECONCILE_CONCURRENCY = 8;
  let reconcileIdx = 0;
  async function reconcileOne(id: string): Promise<void> {
    let actuallyRunning = false;
    try {
      actuallyRunning = await daemonIsRunning(id);
    } catch (err) {
      logger.warn(
        {
          serverId: id,
          err: err instanceof Error ? err.message : String(err),
        },
        "Could not verify running state (assuming stopped)",
      );
    }
    await prisma.server.update({
      where: { id },
      data: { status: actuallyRunning ? "RUNNING" : "STOPPED" },
    });
  }
  await Promise.all(
    Array.from(
      { length: Math.min(RECONCILE_CONCURRENCY, maybeStale.length) },
      async () => {
        while (reconcileIdx < maybeStale.length) {
          const { id } = maybeStale[reconcileIdx++]!;
          await reconcileOne(id);
        }
      },
    ),
  );

  // Clean leftover containers on every online node (multi-node)
  const allNodes = await prisma.node.findMany({ select: { id: true, name: true } });
  for (const n of allNodes) {
    try {
      await daemonCleanupContainers(n.id);
    } catch (err) {
      logger.warn(
        {
          nodeId: n.id,
          nodeName: n.name,
          err: err instanceof Error ? err.message : String(err),
        },
        "Daemon cleanup skipped for node",
      );
    }
  }

  const trustProxyEnv =
    process.env.TRUST_PROXY === "true" ||
    process.env.TRUST_PROXY === "1" ||
    config.sessionSecure;
  const trustedProxyList = (
    process.env.TRUSTED_PROXIES || "127.0.0.1,::1,::ffff:127.0.0.1"
  )
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
    // Only honour X-Forwarded-For from known reverse proxies (default: localhost).
    // Prevents spoofed client IPs from bypassing login rate limits if the API
    // is ever reachable beyond prod-web.
    trustProxy: !trustProxyEnv
      ? false
      : trustAllProxies
        ? true
        : (address: string) => {
            const bare = address.replace(/^::ffff:/, "");
            return (
              trustedProxyList.includes(address) ||
              trustedProxyList.includes(bare)
            );
          },
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      if (!body || body === "") {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

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
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
    ],
    exposedHeaders: [
      "Accept-Ranges",
      "Content-Range",
      "Content-Length",
      "X-Request-Id",
    ],
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
  registerAuthRoutes(app);
  registerTwoFactorRoutes(app);
  registerTwoFactorGuard(app);
  registerAccountApiRoutes(app);
  registerAccountGdprRoutes(app);
  registerAccountPushRoutes(app);
  registerApiKeyRoutes(app);
  registerAppPasswordRoutes(app);
  registerApplicationKeyAdminRoutes(app);
  registerApplicationRoutes(app);
  registerBillingRoutes(app);
  registerOwnershipGuard(app);
  registerSftpAuthRoutes(app);
  registerNodeRoutes(app);
  registerStatusRoutes(app);
  registerServerRoutes(app);
  registerLicenseRoutes(app);
  registerAdminSettingsRoutes(app);
  registerActivityRoutes(app);
  registerAllocationRoutes(app);
  registerDatabaseRoutes(app);
  registerSubUserRoutes(app);
  registerInviteRoutes(app);
  registerImportRoutes(app);
  registerPlayerActionRoutes(app);
  registerIconRoutes(app);
  registerFileRoutes(app);
  registerBackupRoutes(app);
  registerBotRoutes(app);
  registerTaskRoutes(app);
  registerLogRoutes(app);
  registerResourcePackRoutes(app);
  registerConsoleWs(app);
  registerAdminLogsWs(app);
  registerPlayersWs(app);

  app.get("/api/health", async () => ({ ok: true }));

  /** Readiness: DB reachable; optionally local daemon when not skipped. */
  app.get("/api/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply
        .status(503)
        .send({ ok: false, error: "database unavailable" });
    }

    const skipLocal =
      process.env.SKIP_LOCAL_DAEMON === "1" ||
      process.env.SKIP_LOCAL_DAEMON === "true";
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
          return reply
            .status(503)
            .send({ ok: false, error: "local daemon not ready" });
        }
      } catch {
        return reply
          .status(503)
          .send({ ok: false, error: "local daemon unreachable" });
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

  let lastActivityPrune = 0;
  const schedulerTimer = setInterval(() => {
    void (async () => {
      try {
        const { acquireSchedulerLock } = await import("./redis.js");
        const isLeader = await acquireSchedulerLock();
        if (!isLeader) return;

        await sessionStore.purgeExpired?.();
        if (Date.now() - lastActivityPrune > 60 * 60_000) {
          lastActivityPrune = Date.now();
          const pruned = await pruneActivityLog();
          if (pruned > 0) {
            app.log.info({ pruned }, "Pruned expired activity events");
          }
        }
        const servers = await prisma.server.findMany({ select: { id: true } });
        const ids = servers.map((s) => s.id);
        const backups = await runDueBackupSchedules(ids);
        for (const item of backups) {
          app.log.info(
            { serverId: item.serverId, backupId: item.backupId },
            "Scheduled backup created",
          );
        }
        const tasks = await runDueScheduledTasks(ids);
        for (const item of tasks) {
          app.log.info(
            { serverId: item.serverId, taskId: item.taskId, kind: item.kind },
            "Scheduled task ran",
          );
        }
      } catch (err) {
        app.log.error({ err }, "Scheduler tick failed");
      }
    })();
  }, 60_000);
  schedulerTimer.unref?.();

  const shutdown = async () => {
    clearInterval(schedulerTimer);
    stopDaemonEventBridge();
    app.log.info("Shutting down — stopping bots (Minecraft stays with daemon)…");
    try {
      const { flushStatsHistory } = await import("./servers/stats-history.js");
      await flushStatsHistory();
    } catch {
      // ignore persist errors on shutdown
    }
    try {
      const { closeRedis } = await import("./redis.js");
      await closeRedis();
    } catch {
      // ignore
    }
    await botManager.stopAll();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`API listening on http://${config.host}:${config.port}`);
  if (localNodeId) {
    app.log.info(`Local daemon node ${localNodeId} token loaded`);
  } else {
    app.log.info("Local daemon skipped (SKIP_LOCAL_DAEMON=1)");
  }

  startActivityWatch();
  startDiskWatch();
  startDiscordStatusWorker();
  void startDaemonEventBridge();
  const { startPanelEventBus } = await import("./redis.js");
  await startPanelEventBus();
  const { hydrateTransferJobsFromDisk } = await import("./servers/transfer.js");
  await hydrateTransferJobsFromDisk();
  logger.info("Hydrated transfer job state from disk/redis");

  const { startLicenseWatcher, validateLicense, assertLicensePanelQuota } =
    await import("./license/license.js");
  startLicenseWatcher();

  // startOnBoot: resume servers the user did not intentionally stop
  // (`stoppedByUser` is set on Stop/Kill and cleared on Start/Restart).
  const license = await validateLicense(true).catch(() => null);
  if (!license?.valid) {
    app.log.warn(
      { status: license?.status, message: license?.message },
      "License not valid — startOnBoot limited to unlicensed free tier (1 server ≤10 GB)",
    );
  }
  const bootServers = await prisma.server.findMany({
    where: { startOnBoot: true, stoppedByUser: false },
    orderBy: { createdAt: "asc" },
  });
  const bootStaggerMs = Number(process.env.BOOT_START_STAGGER_MS ?? 20_000);
  for (let i = 0; i < bootServers.length; i++) {
    const server = bootServers[i]!;
    try {
      if (await daemonIsRunning(server.id)) {
        app.log.info(
          { serverId: server.id, name: server.name },
          "Server already running, skipping boot start",
        );
        continue;
      }
      await assertLicensePanelQuota(server.memoryMb, {
        excludeServerId: server.id,
      });
      app.log.info(
        { serverId: server.id, name: server.name },
        `Starting server on boot (${i + 1}/${bootServers.length})`,
      );
      const { startServerIfLicensed } = await import("./license/license.js");
      await startServerIfLicensed(server.id);
    } catch (err) {
      app.log.error({ err, serverId: server.id }, "Failed to start server on boot");
    }
    if (i < bootServers.length - 1 && bootStaggerMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, bootStaggerMs));
    }
  }
}

main().catch((err) => {
  logger.error({ err }, "API failed to start");
  process.exit(1);
});
