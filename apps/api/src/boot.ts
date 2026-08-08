import type { FastifyInstance } from "fastify";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import {
  daemonCleanupContainers,
  daemonIsRunning,
  loadPersistedNodeTokens,
  setNodeToken,
} from "./nodes/daemon-client.js";
import { ensureLocalNode } from "./nodes/nodes.js";
import { migrateAllScheduledTasksFromJson } from "./servers/scheduled-tasks.js";

export async function restoreDaemonTokens(): Promise<string | null> {
  const restored = loadPersistedNodeTokens();
  if (restored > 0) {
    logger.info({ restored }, "Restored daemon token(s) from vault");
  }
  const skipLocalDaemon =
    process.env.SKIP_LOCAL_DAEMON === "1" || process.env.SKIP_LOCAL_DAEMON === "true";
  if (skipLocalDaemon) {
    logger.info(
      "SKIP_LOCAL_DAEMON=1 — not creating/starting a local daemon node (use remote nodes)",
    );
    return null;
  }
  const { nodeId, token } = await ensureLocalNode();
  setNodeToken(nodeId, token);
  return nodeId;
}

export async function runStartupMigrations(): Promise<void> {
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
      logger.info({ count: bedrock }, "Fixed Bedrock primary allocation protocol(s)");
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

  try {
    const { migrateBackupSchedulesFromFiles } = await import("./servers/backup-schedule.js");
    const ids = (await prisma.server.findMany({ select: { id: true } })).map((s) => s.id);
    const n = await migrateBackupSchedulesFromFiles(ids);
    if (n > 0) {
      logger.info({ count: n }, "Migrated backup schedule(s) from JSON to DB");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Backup-schedule JSON migration skipped");
  }
}

export async function reconcileServerStatuses(): Promise<void> {
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
    Array.from({ length: Math.min(RECONCILE_CONCURRENCY, maybeStale.length) }, async () => {
      while (reconcileIdx < maybeStale.length) {
        const { id } = maybeStale[reconcileIdx++]!;
        await reconcileOne(id);
      }
    }),
  );
}

export async function cleanupDaemonContainers(): Promise<void> {
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
}

export async function startBootServers(app: FastifyInstance): Promise<void> {
  // startOnBoot: resume servers the user did not intentionally stop
  // (`stoppedByUser` is set on Stop/Kill and cleared on Start/Restart).
  const { validateLicense, assertLicensePanelQuota } = await import("./license/license.js");
  const license = await validateLicense(true).catch(() => null);
  if (!license?.valid) {
    app.log.warn(
      { status: license?.status, message: license?.message },
      "License not valid — startOnBoot limited to unlicensed free tier (1 server ≤10 GB)",
    );
  }
  const bootServers = await prisma.server.findMany({
    where: { startOnBoot: true, stoppedByUser: false, suspended: false },
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
