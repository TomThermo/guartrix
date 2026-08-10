import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerBackup } from "@guartrix/shared";
import { formatBytes } from "@guartrix/shared";
import { encryptBackupArchive, isBackupEncryptionEnabled } from "../backup-crypto.js";
import { serverBackupsDir, serverDir } from "../../config.js";
import { logger } from "../../logger.js";
import { processManager } from "../process-manager.js";
import { readBackupSchedule, writeBackupSchedule } from "../backup-schedule.js";
import { runOffsiteBackupHook } from "../backup-offsite.js";
import { archivePath, metaPath, TAR_EXCLUDES } from "../backup-paths.js";
import { embedMysqlDumpsInArchive } from "../backup-mysql.js";
import { releaseBackupBusy, tryAcquireBackupBusy } from "../backup-busy.js";
import { pruneBackups } from "./list.js";

const execFileAsync = promisify(execFile);

async function flushWorldIfRunning(serverId: string): Promise<void> {
  if (!processManager.isRunning(serverId)) return;
  try {
    processManager.sendCommand(serverId, "save-all flush");
    await new Promise((r) => setTimeout(r, 2500));
  } catch {
    // best-effort
  }
}

export async function createBackup(opts: {
  serverId: string;
  note?: string | null;
  trigger?: "manual" | "scheduled";
  /** When false, do not advance the separate Backup schedule (used by schedule chains). */
  advanceBackupSchedule?: boolean;
}): Promise<ServerBackup> {
  const { serverId } = opts;
  if (!(await tryAcquireBackupBusy(serverId))) {
    throw new Error("A backup is already running for this server");
  }

  try {
    await fs.mkdir(serverBackupsDir(serverId), { recursive: true });
    await flushWorldIfRunning(serverId);

    const createdAt = new Date();
    const id = createdAt.toISOString().replace(/[:.]/g, "-");
    const dest = archivePath(serverId, id);

    // Prefer daemon export so remote-node worlds are included (panel DATA_DIR may be empty).
    try {
      const { daemonExportArchiveToFile } = await import("../../nodes/daemon-client.js");
      await daemonExportArchiveToFile(serverId, dest);
    } catch (daemonErr) {
      const source = serverDir(serverId);
      try {
        await fs.access(source);
      } catch {
        throw daemonErr instanceof Error ? daemonErr : new Error("Server data folder not found");
      }
      await execFileAsync("tar", ["-czf", dest, ...TAR_EXCLUDES, "-C", source, "."], {
        maxBuffer: 16 * 1024 * 1024,
      });
    }

    try {
      await embedMysqlDumpsInArchive(serverId, dest);
    } catch (err) {
      logger.warn({ err, serverId }, "mysql dump embed in backup failed — files only");
    }

    const stPlain = await fs.stat(dest);
    const trigger = opts.trigger ?? "manual";
    const note = opts.note?.trim() || null;

    let fileName = `${id}.tar.gz`;
    let sizeBytes = stPlain.size;
    let encrypted = false;
    let archiveForOffsite = dest;

    if (isBackupEncryptionEnabled()) {
      const sealed = await encryptBackupArchive(dest);
      fileName = path.basename(sealed.encPath);
      sizeBytes = sealed.sizeBytes;
      encrypted = true;
      archiveForOffsite = sealed.encPath;
    }

    await fs.writeFile(
      metaPath(serverId, id),
      `${JSON.stringify(
        {
          id,
          fileName,
          createdAt: createdAt.toISOString(),
          note,
          trigger,
          sizeBytes,
          encrypted,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const schedule = await readBackupSchedule(serverId);
    await pruneBackups(serverId, schedule.keepCount);

    if (opts.trigger === "scheduled" && opts.advanceBackupSchedule !== false) {
      const updated = await writeBackupSchedule(serverId, {
        lastRunAt: createdAt.toISOString(),
      });
      // writeBackupSchedule recomputes nextRunAt
      void updated;
    }

    await runOffsiteBackupHook({
      archivePath: archiveForOffsite,
      serverId,
      backupId: id,
      fileName,
    });

    return {
      id,
      fileName,
      sizeBytes,
      sizeLabel: formatBytes(sizeBytes),
      createdAt: createdAt.toISOString(),
      note,
      trigger,
      encrypted,
    };
  } finally {
    await releaseBackupBusy(serverId);
  }
}
