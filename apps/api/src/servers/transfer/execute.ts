import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatBytes } from "@msm/shared";
import {
  closeServerAllocationFirewalls,
  ensurePrimaryAllocation,
  openServerAllocationFirewalls,
} from "../allocations.js";
import { logActivity } from "../../activity-log.js";
import {
  daemonDeployArchiveFileOnNode,
  daemonWipeServerOnNode,
} from "../../nodes/daemon-client.js";
import { prisma } from "../../db.js";
import { updateServerProperties } from "../properties.js";
import { logger } from "../../logger.js";
import {
  persistTransferJob,
  scheduleTransferJobCleanup,
  setTransferChunkProgress,
  setTransferStep,
  type TransferJob,
} from "../transfer-jobs.js";
import { copyArchivePeerOrStaging, moveServerMysqlDatabases } from "./staging.js";

export async function setServerProgress(
  serverId: string,
  status: "TRANSFERRING" | "STOPPED" | "ERROR",
  message: string | null,
): Promise<void> {
  await prisma.server.update({
    where: { id: serverId },
    data: { status, errorMessage: message },
  });
}

export interface TransferMeta {
  oldPort: number;
  newPort: number;
  subdomain: string | null;
  name: string;
}

export async function runTransfer(job: TransferJob, meta: TransferMeta): Promise<void> {
  const { serverId, fromNodeId, toNodeId } = job;
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-transfer-${serverId}-`));
  let cutOver = false;
  let peerCopied = false;
  let payloadBytes = 0;
  let archivePath: string | null = null;

  try {
    const archive = await copyArchivePeerOrStaging(job, staging, setServerProgress);
    peerCopied = archive.peerCopied;
    payloadBytes = archive.payloadBytes;
    archivePath = archive.archivePath;

    setTransferStep(job, 2, "Rebinding allocations…");
    await setServerProgress(serverId, "TRANSFERRING", "Transfer: rebinding network…");
    await closeServerAllocationFirewalls(serverId, fromNodeId).catch(() => undefined);

    // Move allocation rows to the destination (remap primary port if requested).
    const allocs = await prisma.allocation.findMany({ where: { serverId } });
    for (const alloc of allocs) {
      const nextPort = alloc.isPrimary && meta.newPort !== meta.oldPort ? meta.newPort : alloc.port;
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

    if (!peerCopied) {
      if (!archivePath) {
        throw new Error("Transfer archive missing after panel staging export");
      }
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
      await daemonDeployArchiveFileOnNode(serverId, toNodeId, archivePath);
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
      archivePath = null;
    } else {
      setTransferStep(job, 3, "Finalizing deploy…");
      await setServerProgress(serverId, "TRANSFERRING", "Transfer: finalizing on destination…");
    }
    setTransferChunkProgress(job, 3, 0.75, "Moving MySQL databases…", payloadBytes, payloadBytes);
    await updateServerProperties(serverId, {}, meta.newPort);

    await moveServerMysqlDatabases(job, staging, payloadBytes, setServerProgress);
    setTransferChunkProgress(job, 3, 1, "Deploy complete", payloadBytes, payloadBytes);

    setTransferStep(job, 4, "Updating DNS & wiping source…");
    await setServerProgress(serverId, "TRANSFERRING", "Transfer: DNS & cleanup…");
    try {
      const { ensureServerSubdomain, cloudflareConfigured } = await import(
        "../../nodes/cloudflare-dns.js"
      );
      if (cloudflareConfigured() && meta.subdomain) {
        const destNode = await prisma.node.findUnique({ where: { id: toNodeId } });
        const { resolveNodePublicIpv4 } = await import("../../nodes/nodes.js");
        const ipv4 = destNode ? resolveNodePublicIpv4(destNode) : null;
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
      logger.warn({ err, serverId }, "transfer wipe on source node failed");
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
        const { startServerIfLicensed } = await import("../../license/license.js");
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
