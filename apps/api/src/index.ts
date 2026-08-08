import dns from "node:dns";
import fs from "node:fs/promises";
import path from "node:path";

// Prefer IPv4 for outbound HTTPS (Modrinth/Cloudflare). Broken IPv6 on the host
// makes undici fetch hang until timeout while curl -4 works fine.
dns.setDefaultResultOrder("ipv4first");

import { ensureBootstrapAdmin } from "./auth/auth.js";
import { createSessionStore, ensureSessionDir } from "./auth/session-store.js";
import { createRateLimitStore, setActiveRateLimitStore } from "./rate-limit-store.js";
import { pruneActivityLog } from "./activity-log.js";
import { startActivityWatch } from "./activity-watch.js";
import { startDiscordStatusWorker } from "./discord-status.js";
import { startDiskWatch } from "./servers/disk-watch.js";
import { config } from "./config.js";
import { requireRedisHa } from "./saas-flags.js";
import { loadAndApplyPanelSettings } from "./panel-settings.js";
import { prisma } from "./db.js";
import { migrateLegacyBrandFiles } from "./brand-migrate.js";
import { runDueBackupSchedules } from "./servers/backups.js";
import { runDueScheduledTasks } from "./servers/scheduled-tasks.js";
import { startDaemonEventBridge, stopDaemonEventBridge } from "./nodes/daemon-events.js";
import { logger } from "./logger.js";
import { buildApp } from "./app-build.js";
import {
  cleanupDaemonContainers,
  reconcileServerStatuses,
  restoreDaemonTokens,
  runStartupMigrations,
  startBootServers,
} from "./boot.js";

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

  const localNodeId = await restoreDaemonTokens();
  await runStartupMigrations();
  await reconcileServerStatuses();
  await cleanupDaemonContainers();

  const app = await buildApp(sessionStore);

  let lastActivityPrune = 0;
  const runSchedulerTick = async () => {
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
      const backups = await runDueBackupSchedules();
      for (const item of backups) {
        app.log.info(
          { serverId: item.serverId, backupId: item.backupId },
          "Scheduled backup created",
        );
      }
      const tasks = await runDueScheduledTasks();
      for (const item of tasks) {
        app.log.info(
          { serverId: item.serverId, taskId: item.taskId, kind: item.kind },
          "Scheduled task ran",
        );
      }
    } catch (err) {
      app.log.error({ err }, "Scheduler tick failed");
    }
  };

  const { initJobQueues, enqueueJob, closeJobQueues, jobsMode } = await import("./jobs/queue.js");
  const { runDiskWatchTick } = await import("./servers/disk-watch.js");
  await initJobQueues({
    onBackupTick: async () => {
      const backups = await runDueBackupSchedules();
      for (const item of backups) {
        app.log.info(
          { serverId: item.serverId, backupId: item.backupId },
          "Scheduled backup created",
        );
      }
    },
    onScheduleTick: async () => {
      const tasks = await runDueScheduledTasks();
      for (const item of tasks) {
        app.log.info(
          { serverId: item.serverId, taskId: item.taskId, kind: item.kind },
          "Scheduled task ran",
        );
      }
    },
    onMaintenanceTick: async () => {
      const { acquireSchedulerLock } = await import("./redis.js");
      if (!(await acquireSchedulerLock())) return;
      await sessionStore.purgeExpired?.();
      const pruned = await pruneActivityLog();
      if (pruned > 0) {
        app.log.info({ pruned }, "Pruned expired activity events");
      }
    },
    onDiskWatchTick: async () => {
      await runDiskWatchTick();
    },
    onTransfer: async ({ serverId, meta }) => {
      const { executeQueuedTransfer } = await import("./servers/transfer.js");
      await executeQueuedTransfer(serverId, meta);
    },
  });
  app.log.info({ jobsMode: jobsMode() }, "Job queue mode");

  if (requireRedisHa() && jobsMode() !== "bullmq") {
    app.log.error(
      "REQUIRE_REDIS_HA/PANEL_HA is set but BullMQ did not start — check REDIS_URL and JOBS_BULLMQ",
    );
    process.exit(1);
  }
  if (requireRedisHa()) {
    const { isRedisConfigured, getRedisStatus } = await import("./redis.js");
    if (!isRedisConfigured()) {
      app.log.error("REQUIRE_REDIS_HA/PANEL_HA requires REDIS_URL");
      process.exit(1);
    }
    const st = await getRedisStatus();
    if (!st.connected) {
      app.log.error({ err: st.error }, "REQUIRE_REDIS_HA/PANEL_HA requires a connected Redis");
      process.exit(1);
    }
    const sessionOk = (process.env.SESSION_STORE || "").trim().toLowerCase() === "redis";
    const rateOk = (process.env.RATE_LIMIT_STORE || "").trim().toLowerCase() === "redis";
    if (!sessionOk || !rateOk) {
      app.log.error(
        "REQUIRE_REDIS_HA/PANEL_HA requires SESSION_STORE=redis and RATE_LIMIT_STORE=redis",
      );
      process.exit(1);
    }
  }

  const schedulerTimer = setInterval(() => {
    void (async () => {
      if (jobsMode() === "bullmq") {
        const { acquireSchedulerLock } = await import("./redis.js");
        if (!(await acquireSchedulerLock())) return;
        await enqueueJob("backups", "tick", {}, { jobId: "backup-leader-tick" }).catch(
          () => undefined,
        );
        await enqueueJob(
          "schedules",
          "tick",
          {},
          {
            jobId: "schedules-leader-tick",
          },
        ).catch(() => undefined);
        if (Date.now() - lastActivityPrune > 60 * 60_000) {
          lastActivityPrune = Date.now();
          await enqueueJob(
            "maintenance",
            "prune",
            {},
            {
              jobId: "maintenance-prune",
            },
          ).catch(() => undefined);
        }
        return;
      }
      await runSchedulerTick();
    })();
  }, 60_000);
  schedulerTimer.unref?.();

  const shutdown = async () => {
    clearInterval(schedulerTimer);
    stopDaemonEventBridge();
    app.log.info("Shutting down…");
    try {
      await closeJobQueues();
    } catch {
      // ignore
    }
    try {
      const { closeRedis } = await import("./redis.js");
      await closeRedis();
    } catch {
      // ignore
    }
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
  // BullMQ: timer enqueues; worker runs runDiskWatchTick. Else: in-process tick.
  if (jobsMode() === "bullmq") {
    startDiskWatch({
      enqueue: () => enqueueJob("disk-watch", "tick", {}, { jobId: "disk-watch-tick" }),
    });
  } else {
    startDiskWatch();
  }
  startDiscordStatusWorker();
  void startDaemonEventBridge();
  const { startPanelEventBus } = await import("./redis.js");
  await startPanelEventBus();
  const { hydrateTransferJobsFromDisk } = await import("./servers/transfer.js");
  await hydrateTransferJobsFromDisk();
  logger.info("Hydrated transfer job state from disk/redis");

  const { startLicenseWatcher } = await import("./license/license.js");
  startLicenseWatcher();

  await startBootServers(app);
}

main().catch((err) => {
  logger.error({ err }, "API failed to start");
  process.exit(1);
});
