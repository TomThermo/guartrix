import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TransferJobStatus } from "@msm/shared";
import { formatBytes } from "@msm/shared";
import {
  closeServerAllocationFirewalls,
  ensurePrimaryAllocation,
  openServerAllocationFirewalls,
} from "./allocations.js";
import { logActivity } from "../activity-log.js";
import { isBackupBusy } from "./backups.js";
import {
  daemonDeployArchiveFileOnNode,
  daemonExportArchiveToFileOnNode,
  daemonWipeServerOnNode,
} from "../nodes/daemon-client.js";
import { prisma } from "../db.js";
import {
  isSealedDatabasePassword,
  sealDatabasePassword,
  unsealDatabasePassword,
} from "../db-password.js";
import { assertNodeCapacity } from "../nodes/nodes.js";
import { processManager } from "./process-manager.js";
import { updateServerProperties } from "./properties.js";
import { logger } from "../logger.js";
import {
  getTransferJob,
  getTransferJobInMemory,
  persistTransferJob,
  scheduleTransferJobCleanup,
  setTransferChunkProgress,
  setTransferJobInMemory,
  setTransferStep,
  TRANSFER_STEPS,
  type TransferJob,
} from "./transfer-jobs.js";

export {
  countTransferJobsInMemory,
  getTransferJob,
  hydrateTransferJobsFromDisk,
} from "./transfer-jobs.js";

async function setServerProgress(
  serverId: string,
  status: "TRANSFERRING" | "STOPPED" | "ERROR",
  message: string | null,
): Promise<void> {
  await prisma.server.update({
    where: { id: serverId },
    data: { status, errorMessage: message },
  });
}

export interface StartTransferInput {
  serverId: string;
  toNodeId: string;
  port?: number;
  startAfter?: boolean;
  actor?: { id: string; username: string } | null;
}

/**
 * Validate and kick off an async node transfer. Returns the initial job status.
 * Throws with a user-facing Error message on precondition failure.
 */
export async function startServerTransfer(
  input: StartTransferInput,
): Promise<TransferJobStatus> {
  const existing = getTransferJobInMemory(input.serverId);
  if (existing && !existing.done) {
    throw new Error("A transfer is already in progress for this server");
  }

  const server = await prisma.server.findUnique({
    where: { id: input.serverId },
    include: {
      allocations: true,
      databases: { select: { id: true } },
      node: true,
    },
  });
  if (!server) throw new Error("Server not found");
  if (!server.nodeId) throw new Error("Server has no source node");
  if (server.nodeId === input.toNodeId) {
    throw new Error("Server is already on that node");
  }
  if (server.status === "TRANSFERRING" || server.status === "CREATING") {
    throw new Error("Server is busy — wait for the current operation to finish");
  }
  if (
    processManager.isRunning(server.id) ||
    server.status === "RUNNING" ||
    server.status === "STARTING" ||
    server.status === "STOPPING"
  ) {
    throw new Error("Stop the server before moving it to another node");
  }
  if (isBackupBusy(server.id)) {
    throw new Error("A backup is running — wait before transferring");
  }

  const dest = await prisma.node.findUnique({ where: { id: input.toNodeId } });
  if (!dest) throw new Error("Destination node not found");

  await assertNodeCapacity(input.toNodeId, server.memoryMb, {
    excludeServerId: server.id,
  });

  const { primaryAllocationProtocol } = await import("@msm/shared");
  const primaryProto = primaryAllocationProtocol(server.type);

  const newPort = input.port ?? server.port;
  if (newPort !== server.port) {
    // Remapping primary also requires updating the primary allocation.
  }
  const free = await processManager.isPortFree(
    newPort,
    server.id,
    input.toNodeId,
    primaryProto,
  );
  if (!free) {
    throw new Error(
      `Port ${newPort}/${primaryProto} is already in use on the destination node`,
    );
  }

  // Every allocated port (primary + extras) must be free on the destination.
  for (const alloc of server.allocations) {
    const port = alloc.isPrimary && input.port ? input.port : alloc.port;
    const clash = await prisma.allocation.findFirst({
      where: {
        nodeId: input.toNodeId,
        port,
        protocol: alloc.protocol,
        NOT: { serverId: server.id },
      },
    });
    if (clash?.serverId) {
      throw new Error(
        `Port ${port}/${alloc.protocol} is already assigned on the destination node`,
      );
    }
    const hostFree = await processManager.isPortFree(
      port,
      server.id,
      input.toNodeId,
      alloc.protocol === "udp" ? "udp" : "tcp",
    );
    if (!hostFree) {
      throw new Error(
        `Port ${port}/${alloc.protocol} is already in use on the destination host`,
      );
    }
  }

  const job: TransferJob = {
    serverId: server.id,
    step: TRANSFER_STEPS[0],
    steps: [...TRANSFER_STEPS],
    stepIndex: 0,
    error: null,
    done: false,
    ok: false,
    percent: 0,
    detail: "Validating…",
    bytesTransferred: null,
    bytesTotal: null,
    fromNodeId: server.nodeId,
    toNodeId: input.toNodeId,
    startAfter: Boolean(input.startAfter),
    actor: input.actor ?? null,
  };
  setTransferJobInMemory(job);
  void persistTransferJob(job);

  await setServerProgress(server.id, "TRANSFERRING", "Transfer: starting…");

  void runTransfer(job, {
    oldPort: server.port,
    newPort,
    subdomain: server.subdomain,
    name: server.name,
  }).catch((err) => {
    logger.error({ err, serverId: server.id }, "transfer unexpected failure");
  });

  return getTransferJob(server.id)!;
}

async function runTransfer(
  job: TransferJob,
  meta: {
    oldPort: number;
    newPort: number;
    subdomain: string | null;
    name: string;
  },
): Promise<void> {
  const { serverId, fromNodeId, toNodeId } = job;
  const staging = await fs.mkdtemp(
    path.join(os.tmpdir(), `guartrix-transfer-${serverId}-`),
  );
  let cutOver = false;

  try {
    setTransferStep(job, 1, "Exporting archive from source…");
    await setServerProgress(serverId, "TRANSFERRING", "Transfer: exporting files…");
    const archivePath = path.join(staging, "source.tar.gz");
    await daemonExportArchiveToFileOnNode(serverId, fromNodeId, archivePath);
    const archiveStat = await fs.stat(archivePath);
    const payloadBytes = archiveStat.size;
    setTransferChunkProgress(
      job,
      1,
      1,
      `Exported ${formatBytes(payloadBytes)}`,
      payloadBytes,
      payloadBytes,
    );

    setTransferStep(job, 2, "Rebinding allocations…");
    await setServerProgress(serverId, "TRANSFERRING", "Transfer: rebinding network…");
    await closeServerAllocationFirewalls(serverId, fromNodeId).catch(() => undefined);

    // Move allocation rows to the destination (remap primary port if requested).
    const allocs = await prisma.allocation.findMany({ where: { serverId } });
    for (const alloc of allocs) {
      const nextPort =
        alloc.isPrimary && meta.newPort !== meta.oldPort
          ? meta.newPort
          : alloc.port;
      // Clear any free pool row that would collide, then update.
      await prisma.allocation.deleteMany({
        where: {
          nodeId: toNodeId,
          port: nextPort,
          protocol: alloc.protocol,
          serverId: null,
        },
      });
      await prisma.allocation.update({
        where: { id: alloc.id },
        data: { nodeId: toNodeId, port: nextPort },
      });
    }

    await prisma.server.update({
      where: { id: serverId },
      data: { nodeId: toNodeId, port: meta.newPort },
    });
    await ensurePrimaryAllocation({
      serverId,
      nodeId: toNodeId,
      port: meta.newPort,
    });
    cutOver = true;

    await openServerAllocationFirewalls(serverId, toNodeId);

    setTransferStep(job, 3, `Deploying ${formatBytes(payloadBytes)}…`);
    await setServerProgress(serverId, "TRANSFERRING", "Transfer: deploying to destination…");
    setTransferChunkProgress(
      job,
      3,
      0.15,
      `Uploading ${formatBytes(payloadBytes)}…`,
      0,
      payloadBytes,
    );
    // Stream archive to dest without unpacking on the panel (one temp copy only).
    await daemonDeployArchiveFileOnNode(serverId, toNodeId, archivePath);
    await fs.rm(archivePath, { force: true }).catch(() => undefined);
    setTransferChunkProgress(
      job,
      3,
      0.75,
      "Moving MySQL databases…",
      payloadBytes,
      payloadBytes,
    );
    await updateServerProperties(serverId, {}, meta.newPort);

    // Move MySQL databases (dump source → create/restore dest → drop source).
    const dbRows = await prisma.database.findMany({ where: { serverId } });
    if (dbRows.length > 0) {
      await setServerProgress(
        serverId,
        "TRANSFERRING",
        `Transfer: moving ${dbRows.length} MySQL database(s)…`,
      );
      const {
        daemonMysqlCreate,
        daemonMysqlDelete,
        daemonMysqlDumpToFile,
        daemonMysqlEnsure,
        daemonMysqlRestoreFromFile,
      } = await import("../nodes/daemon-client.js");
      await daemonMysqlEnsure(toNodeId);
      for (let di = 0; di < dbRows.length; di++) {
        const db = dbRows[di];
        setTransferChunkProgress(
          job,
          3,
          0.75 + (0.25 * (di + 0.5)) / dbRows.length,
          `MySQL ${db.name} (${di + 1}/${dbRows.length})…`,
          payloadBytes,
          payloadBytes,
        );
        const dumpPath = path.join(staging, `db-${db.name}.sql`);
        await daemonMysqlDumpToFile(fromNodeId, db.name, dumpPath);
        const plainPassword = unsealDatabasePassword(db.password);
        await daemonMysqlCreate(toNodeId, {
          name: db.name,
          username: db.username,
          password: plainPassword,
          remote: db.remote,
        });
        await daemonMysqlRestoreFromFile(toNodeId, db.name, dumpPath);
        await daemonMysqlDelete(fromNodeId, {
          name: db.name,
          username: db.username,
          remote: db.remote,
        }).catch(() => undefined);
        const destStatus = await (
          await import("../nodes/daemon-client.js")
        ).daemonMysqlStatus(toNodeId);
        await prisma.database.update({
          where: { id: db.id },
          data: {
            nodeId: toNodeId,
            host: destStatus.host,
            port: destStatus.port,
            ...(!isSealedDatabasePassword(db.password)
              ? { password: sealDatabasePassword(plainPassword) }
              : {}),
          },
        });
        await fs.rm(dumpPath, { force: true }).catch(() => undefined);
      }
    }
    setTransferChunkProgress(
      job,
      3,
      1,
      "Deploy complete",
      payloadBytes,
      payloadBytes,
    );

    setTransferStep(job, 4, "Updating DNS & wiping source…");
    await setServerProgress(serverId, "TRANSFERRING", "Transfer: DNS & cleanup…");
    try {
      const { ensureServerSubdomain, cloudflareConfigured } = await import(
        "../nodes/cloudflare-dns.js"
      );
      if (cloudflareConfigured() && meta.subdomain) {
        const destNode = await prisma.node.findUnique({ where: { id: toNodeId } });
        const { resolveNodePublicIpv4 } = await import("../nodes/nodes.js");
        const ipv4 = destNode
          ? resolveNodePublicIpv4(destNode)
          : null;
        if (ipv4) {
          await ensureServerSubdomain({
            preferredSlug: meta.name,
            currentSlug: meta.subdomain,
            port: meta.newPort,
            ipv4,
          });
        }
      }
    } catch (dnsErr) {
      console.warn(
        `[transfer] DNS update failed for ${serverId}:`,
        dnsErr instanceof Error ? dnsErr.message : dnsErr,
      );
    }

    await daemonWipeServerOnNode(serverId, fromNodeId).catch((err) => {
      logger.warn(
        { err, serverId },
        "transfer wipe on source node failed",
      );
    });

    setTransferStep(job, 5, null);
    job.percent = 100;
    job.detail = null;
    await setServerProgress(serverId, "STOPPED", null);
    job.done = true;
    job.ok = true;
    job.step = "Done";
    void persistTransferJob(job);

    if (job.actor) {
      const updated = await prisma.server.findUnique({ where: { id: serverId } });
      logActivity({
        action: "server.transfer",
        user: job.actor,
        server: updated
          ? { id: updated.id, name: updated.name }
          : { id: serverId, name: meta.name },
        metadata: {
          fromNodeId,
          toNodeId,
          port: meta.newPort,
          startedAfter: job.startAfter,
        },
      });
    }

    if (job.startAfter) {
      try {
        const { startServerIfLicensed } = await import("../license/license.js");
        await startServerIfLicensed(serverId);
      } catch (err) {
        logger.warn({ err, serverId }, "transfer startAfter failed");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    job.error = message;
    job.done = true;
    job.ok = false;
    void persistTransferJob(job);

    if (job.actor) {
      logActivity({
        action: "server.transfer",
        user: job.actor,
        serverId,
        serverName: meta.name,
        success: false,
        metadata: {
          fromNodeId,
          toNodeId,
          error: message,
          cutOver,
        },
      });
    }

    if (!cutOver) {
      // Still on source — restore status and reopen firewalls there.
      await openServerAllocationFirewalls(serverId, fromNodeId).catch(() => undefined);
      await setServerProgress(serverId, "STOPPED", null).catch(() => undefined);
    } else {
      // Already pointed at dest — leave nodeId as dest, surface error for operator.
      await setServerProgress(
        serverId,
        "ERROR",
        `Transfer failed after cutover: ${message}. Files may be on the destination; check both nodes.`,
      ).catch(() => undefined);
    }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    // Keep job status around for a bit so the UI can poll the result.
    scheduleTransferJobCleanup(serverId);
  }
}
