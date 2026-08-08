import fs from "node:fs/promises";
import path from "node:path";
import { formatBytes } from "@msm/shared";
import {
  daemonExportArchiveToFileOnNode,
  daemonPeerDeployArchiveOnNode,
} from "../../nodes/daemon-client.js";
import {
  isSealedDatabasePassword,
  sealDatabasePassword,
  unsealDatabasePassword,
} from "../../db-password.js";
import { prisma } from "../../db.js";
import { logger } from "../../logger.js";
import { setTransferChunkProgress, setTransferStep, type TransferJob } from "../transfer-jobs.js";

export type SetServerProgress = (
  serverId: string,
  status: "TRANSFERRING" | "STOPPED" | "ERROR",
  message: string | null,
) => Promise<void>;

export interface ArchiveCopyResult {
  peerCopied: boolean;
  payloadBytes: number;
  archivePath: string | null;
}

/** Prefer node→node pull; fall back to panel staging when allowed. */
export async function copyArchivePeerOrStaging(
  job: TransferJob,
  stagingDir: string,
  setProgress: SetServerProgress,
): Promise<ArchiveCopyResult> {
  const { serverId, fromNodeId, toNodeId } = job;
  setTransferStep(job, 1, "Copying archive node→node…");
  await setProgress(serverId, "TRANSFERRING", "Transfer: copying files between nodes…");
  try {
    const peer = await daemonPeerDeployArchiveOnNode(serverId, fromNodeId, toNodeId);
    const payloadBytes = peer.bytes ?? 0;
    setTransferChunkProgress(
      job,
      1,
      1,
      payloadBytes > 0 ? `Peer-copied ${formatBytes(payloadBytes)}` : "Peer-copied archive",
      payloadBytes,
      payloadBytes,
    );
    return { peerCopied: true, payloadBytes, archivePath: null };
  } catch (peerErr) {
    const { transferAllowPanelStaging } = await import("../../saas-flags.js");
    if (!transferAllowPanelStaging()) {
      throw new Error(
        `Peer file deploy failed and panel staging is disabled (set TRANSFER_ALLOW_PANEL_STAGING=1 to opt in): ${
          peerErr instanceof Error ? peerErr.message : String(peerErr)
        }`,
      );
    }
    logger.warn(
      {
        err: peerErr instanceof Error ? peerErr : new Error(String(peerErr)),
        serverId,
        fromNodeId,
        toNodeId,
      },
      "Peer deploy failed — falling back to panel staging",
    );
    setTransferStep(job, 1, "Exporting archive from source…");
    await setProgress(serverId, "TRANSFERRING", "Transfer: exporting files…");
    const archivePath = path.join(stagingDir, "source.tar.gz");
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
    return { peerCopied: false, payloadBytes, archivePath };
  }
}

/** Dump/restore (peer or panel staging) each MySQL DB onto the destination node. */
export async function moveServerMysqlDatabases(
  job: TransferJob,
  stagingDir: string,
  payloadBytes: number,
  setProgress: SetServerProgress,
): Promise<void> {
  const { serverId, fromNodeId, toNodeId } = job;
  const dbRows = await prisma.database.findMany({ where: { serverId } });
  if (dbRows.length === 0) return;

  await setProgress(
    serverId,
    "TRANSFERRING",
    `Transfer: moving ${dbRows.length} MySQL database(s)…`,
  );
  const {
    daemonMysqlCreate,
    daemonMysqlDelete,
    daemonMysqlDumpToFile,
    daemonMysqlEnsure,
    daemonMysqlPeerRestoreOnNode,
    daemonMysqlRestoreFromFile,
    daemonMysqlStatus,
  } = await import("../../nodes/daemon-client.js");
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
    const plainPassword = unsealDatabasePassword(db.password);
    await daemonMysqlCreate(toNodeId, {
      name: db.name,
      username: db.username,
      password: plainPassword,
      remote: db.remote,
    });
    let peerMysql = false;
    try {
      await daemonMysqlPeerRestoreOnNode(fromNodeId, toNodeId, db.name);
      peerMysql = true;
    } catch (peerMysqlErr) {
      const { transferAllowPanelStaging } = await import("../../saas-flags.js");
      if (!transferAllowPanelStaging()) {
        throw new Error(
          `Peer MySQL restore failed for ${db.name} and panel staging is disabled (set TRANSFER_ALLOW_PANEL_STAGING=1 to opt in): ${
            peerMysqlErr instanceof Error ? peerMysqlErr.message : String(peerMysqlErr)
          }`,
        );
      }
      logger.warn(
        {
          err: peerMysqlErr instanceof Error ? peerMysqlErr : new Error(String(peerMysqlErr)),
          serverId,
          db: db.name,
        },
        "Peer MySQL restore failed — falling back to panel staging",
      );
      const dumpPath = path.join(stagingDir, `db-${db.name}.sql`);
      await daemonMysqlDumpToFile(fromNodeId, db.name, dumpPath);
      await daemonMysqlRestoreFromFile(toNodeId, db.name, dumpPath);
      await fs.rm(dumpPath, { force: true }).catch(() => undefined);
    }
    if (peerMysql) {
      setTransferChunkProgress(
        job,
        3,
        0.75 + (0.25 * (di + 1)) / dbRows.length,
        `MySQL ${db.name} peer-copied`,
        payloadBytes,
        payloadBytes,
      );
    }
    await daemonMysqlDelete(fromNodeId, {
      name: db.name,
      username: db.username,
      remote: db.remote,
    }).catch(() => undefined);
    const destStatus = await daemonMysqlStatus(toNodeId);
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
  }
}
