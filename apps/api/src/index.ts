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
import { ensureBootstrapAdmin, registerAuthRoutes, registerOwnershipGuard } from "./auth.js";
import { registerCsrfGuard, allowedOrigins } from "./csrf.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { migrateLegacyBrandFiles } from "./brand-migrate.js";
import { processManager } from "./process-manager.js";
import { runDueBackupSchedules } from "./backups.js";
import { runDueScheduledTasks } from "./scheduled-tasks.js";
import { FileSessionStore, ensureSessionDir } from "./session-store.js";
import { pruneActivityLog } from "./activity-log.js";
import { startActivityWatch } from "./activity-watch.js";
import { startDiscordStatusWorker } from "./discord-status.js";
import { startDiskWatch } from "./disk-watch.js";
import { registerActivityRoutes } from "./routes/activity.js";
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
import { registerStatusRoutes } from "./routes/status.js";
import { registerSubUserRoutes } from "./routes/subusers.js";
import { registerInviteRoutes } from "./routes/invites.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerConsoleWs } from "./ws/console.js";
import { registerAdminLogsWs } from "./ws/admin-logs.js";
import { botManager } from "./bot-manager.js";
import { BACKUP_UPLOAD_MAX_BYTES } from "@msm/shared";
import { ensureLocalNode } from "./nodes.js";
import {
  setNodeToken,
  loadPersistedNodeTokens,
  daemonCleanupContainers,
  daemonIsRunning,
} from "./daemon-client.js";
import {
  startDaemonEventBridge,
  stopDaemonEventBridge,
} from "./daemon-events.js";

async function main() {
  await fs.mkdir(path.join(config.dataDir, "servers"), { recursive: true });
  await fs.mkdir(path.join(config.dataDir, "backups"), { recursive: true });
  await migrateLegacyBrandFiles();
  const sessionsDir = path.join(config.dataDir, "sessions");
  ensureSessionDir(sessionsDir);
  const sessionStore = new FileSessionStore(sessionsDir);
  const { setActiveSessionStore } = await import("./session-store.js");
  setActiveSessionStore(sessionStore);
  await ensureBootstrapAdmin();

  // multi-node: restore all node tokens, then refresh/ensure the local daemon token.
  const restored = loadPersistedNodeTokens();
  if (restored > 0) {
    console.info(`[guartrix] Restored ${restored} daemon token(s) from vault`);
  }
  const skipLocalDaemon =
    process.env.SKIP_LOCAL_DAEMON === "1" ||
    process.env.SKIP_LOCAL_DAEMON === "true";
  let localNodeId: string | null = null;
  if (skipLocalDaemon) {
    console.info(
      "[guartrix] SKIP_LOCAL_DAEMON=1 — not creating/starting a local daemon node (use remote nodes)",
    );
  } else {
    const { nodeId, token } = await ensureLocalNode();
    localNodeId = nodeId;
    setNodeToken(nodeId, token);
  }

  try {
    const { migratePrimaryAllocations } = await import("./allocations.js");
    const n = await migratePrimaryAllocations();
    if (n > 0) {
      console.info(`[guartrix] Backfilled ${n} primary allocation(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[guartrix] Allocation migration skipped: ${msg}`);
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
  for (const { id } of maybeStale) {
    let actuallyRunning = false;
    try {
      actuallyRunning = await daemonIsRunning(id);
    } catch (err) {
      console.warn(
        `[guartrix] Could not verify running state for ${id} (assuming stopped):`,
        err instanceof Error ? err.message : err,
      );
    }
    await prisma.server.update({
      where: { id },
      data: { status: actuallyRunning ? "RUNNING" : "STOPPED" },
    });
  }

  // Clean leftover containers on every online node (multi-node)
  const allNodes = await prisma.node.findMany({ select: { id: true, name: true } });
  for (const n of allNodes) {
    try {
      await daemonCleanupContainers(n.id);
    } catch (err) {
      console.warn(
        `[guartrix] Daemon cleanup skipped for node ${n.name}:`,
        err instanceof Error ? err.message : err,
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

  const app = Fastify({
    logger: true,
    bodyLimit: 32 * 1024 * 1024,
    connectionTimeout: 0,
    requestTimeout: 0,
    // Only honour X-Forwarded-For from known reverse proxies (default: localhost).
    // Prevents spoofed client IPs from bypassing login rate limits if the API
    // is ever reachable beyond prod-web.
    trustProxy: !trustProxyEnv
      ? false
      : trustedProxyList.includes("*")
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
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Accept-Ranges", "Content-Range", "Content-Length"],
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

  registerCsrfGuard(app);
  registerAuthRoutes(app);
  registerTwoFactorRoutes(app);
  registerTwoFactorGuard(app);
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

  app.get("/api/health", async () => ({ ok: true }));

  let lastActivityPrune = 0;
  const schedulerTimer = setInterval(() => {
    void (async () => {
      try {
        await sessionStore.purgeExpired();
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

  const { startLicenseWatcher, validateLicense, assertLicensePanelQuota } =
    await import("./license.js");
  startLicenseWatcher();

  // Start servers marked startOnBoot — one at a time, with a cooldown in
  // between, so a VPS reboot doesn't slam the CPU with several JVMs booting
  // simultaneously. Runs on every API startup (not just a real host reboot),
  // so servers that are already running (survived the restart — see the
  // reconciliation above) are skipped instead of being force-recreated.
  const license = await validateLicense(true).catch(() => null);
  if (!license?.valid) {
    app.log.warn(
      { status: license?.status, message: license?.message },
      "License not valid — startOnBoot limited to unlicensed free tier (1 server ≤10 GB)",
    );
  }
  const bootServers = await prisma.server.findMany({
    where: { startOnBoot: true },
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
      const { startServerIfLicensed } = await import("./license.js");
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
  console.error(err);
  process.exit(1);
});
