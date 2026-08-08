import type { TransferJobStatus } from "@msm/shared";
import { isBackupBusy } from "../backups.js";
import { prisma } from "../../db.js";
import { assertNodeCapacity } from "../../nodes/nodes.js";
import { processManager } from "../process-manager.js";
import { logger } from "../../logger.js";
import {
  getTransferJob,
  getTransferJobInMemory,
  persistTransferJob,
  setTransferJobInMemory,
  TRANSFER_STEPS,
  type TransferJob,
} from "../transfer-jobs.js";
import { runTransfer, setServerProgress, type TransferMeta } from "./execute.js";

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
export async function startServerTransfer(input: StartTransferInput): Promise<TransferJobStatus> {
  const existing = getTransferJobInMemory(input.serverId);
  // Allow retry when a prior attempt never left Validate (BullMQ no-op / interrupted).
  if (existing && !existing.done) {
    if (existing.stepIndex === 0 && existing.percent === 0) {
      existing.done = true;
      existing.ok = false;
      existing.error = "Previous move never started — retrying.";
      void persistTransferJob(existing);
    } else {
      throw new Error("A transfer is already in progress for this server");
    }
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
  // Stuck TRANSFERRING with no live job (API restart / BullMQ no-op) — unlock so the user can retry.
  if (server.status === "TRANSFERRING") {
    const live = getTransferJobInMemory(server.id);
    if (!live || live.done || (live.stepIndex === 0 && live.percent === 0)) {
      await setServerProgress(
        server.id,
        "STOPPED",
        "Previous transfer interrupted — try moving the server again.",
      );
      server.status = "STOPPED";
    }
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
  if (await isBackupBusy(server.id)) {
    throw new Error("A backup is running — wait before transferring");
  }

  const dest = await prisma.node.findUnique({ where: { id: input.toNodeId } });
  if (!dest) throw new Error("Destination node not found");

  await assertNodeCapacity(input.toNodeId, server.memoryMb, {
    excludeServerId: server.id,
    placement: true,
    diskMb: server.diskMb,
    cpuLimit: server.cpuLimit,
  });

  const { primaryAllocationProtocol } = await import("@msm/shared");
  const primaryProto = primaryAllocationProtocol(server.type);

  const newPort = input.port ?? server.port;
  if (newPort !== server.port) {
    // Remapping primary also requires updating the primary allocation.
  }
  const free = await processManager.isPortFree(newPort, server.id, input.toNodeId, primaryProto);
  if (!free) {
    throw new Error(`Port ${newPort}/${primaryProto} is already in use on the destination node`);
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
      throw new Error(`Port ${port}/${alloc.protocol} is already assigned on the destination node`);
    }
    const hostFree = await processManager.isPortFree(
      port,
      server.id,
      input.toNodeId,
      alloc.protocol === "udp" ? "udp" : "tcp",
    );
    if (!hostFree) {
      throw new Error(`Port ${port}/${alloc.protocol} is already in use on the destination host`);
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

  const meta: TransferMeta = {
    oldPort: server.port,
    newPort,
    subdomain: server.subdomain,
    name: server.name,
  };

  // Transfers keep progress in this process (Map + disk/redis snapshot). BullMQ cannot
  // reconstruct that state across workers / restarts, and a fixed jobId silently no-ops
  // on retry after a completed job — leaving the UI stuck on Validate 0%. Always run inline.
  void runTransfer(job, meta).catch((err) => {
    logger.error({ err, serverId: server.id }, "transfer unexpected failure");
  });

  return getTransferJob(server.id)!;
}

/**
 * Legacy BullMQ path (pre-1.4.10). Prefer inline `runTransfer` from `startServerTransfer`.
 * Throws when in-memory job is missing/done so Redis jobs fail visibly instead of no-op completing.
 */
export async function executeQueuedTransfer(serverId: string, meta: TransferMeta): Promise<void> {
  const job = getTransferJobInMemory(serverId);
  if (!job || job.done) {
    throw new Error(
      `Transfer job for ${serverId} is not runnable in this API process (missing or already finished)`,
    );
  }
  await runTransfer(job, meta);
}
