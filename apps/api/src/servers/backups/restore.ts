import fs from "node:fs/promises";
import path from "node:path";
import { safeExtractArchive } from "@msm/node-agent";
import { decryptBackupArchive, isEncryptedBackupPath } from "../backup-crypto.js";
import { serverBackupsDir, serverDir } from "../../config.js";
import { processManager } from "../process-manager.js";
import { archivePath, encryptedPath, metaPath, resolveBackupArchivePath } from "../backup-paths.js";
import { restoreMysqlFromBackupDir } from "../backup-mysql.js";
import { releaseBackupBusy, tryAcquireBackupBusy } from "../backup-busy.js";

export async function restoreBackup(opts: { serverId: string; backupId: string }): Promise<void> {
  const { serverId, backupId } = opts;
  if (processManager.isRunning(serverId)) {
    throw new Error("Stop the server before restoring a backup");
  }
  if (!(await tryAcquireBackupBusy(serverId))) {
    throw new Error("A backup operation is already running for this server");
  }

  let plainTmp: string | null = null;
  try {
    const { path: archive, encrypted } = await resolveBackupArchivePath(serverId, backupId);
    const dest = serverDir(serverId);

    await fs.mkdir(dest, { recursive: true });

    // Clear current server files (keep the directory). Backups folder is separate.
    const entries = await fs.readdir(dest);
    for (const name of entries) {
      await fs.rm(path.join(dest, name), { recursive: true, force: true });
    }

    let extractFrom = archive;
    if (encrypted || isEncryptedBackupPath(archive)) {
      plainTmp = path.join(
        serverBackupsDir(serverId),
        `.restore-${backupId}-${process.pid}.tar.gz`,
      );
      try {
        await decryptBackupArchive(archive, plainTmp);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Could not decrypt backup (wrong BACKUP_ENCRYPTION_KEY / SESSION_SECRET?): ${message}`,
        );
      }
      extractFrom = plainTmp;
    }

    await safeExtractArchive(extractFrom, dest);

    await restoreMysqlFromBackupDir(serverId, dest);

    // Drop stale locks from the archive era
    await fs.rm(path.join(dest, "session.lock"), { force: true }).catch(() => undefined);
  } finally {
    if (plainTmp) {
      await fs.rm(plainTmp, { force: true }).catch(() => undefined);
    }
    await releaseBackupBusy(serverId);
  }
}

export async function deleteBackup(serverId: string, backupId: string): Promise<void> {
  const { path: archive } = await resolveBackupArchivePath(serverId, backupId);
  await fs.rm(archive, { force: true });
  await fs.rm(archivePath(serverId, backupId), { force: true }).catch(() => undefined);
  await fs.rm(encryptedPath(serverId, backupId), { force: true }).catch(() => undefined);
  await fs.rm(metaPath(serverId, backupId), { force: true }).catch(() => undefined);
}

export async function getBackupFilePath(serverId: string, backupId: string): Promise<string> {
  const { path: file } = await resolveBackupArchivePath(serverId, backupId);
  return file;
}

export async function assertBackupExists(serverId: string, backupId: string): Promise<string> {
  const { path: file } = await resolveBackupArchivePath(serverId, backupId);
  return file;
}
