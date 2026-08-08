import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerBackup } from "@msm/shared";
import { formatBytes } from "@msm/shared";
import { encryptBackupArchive, isBackupEncryptionEnabled } from "../backup-crypto.js";
import { serverBackupsDir } from "../../config.js";
import { safeExtractArchive } from "@msm/node-agent";
import { readBackupSchedule } from "../backup-schedule.js";
import { archivePath, metaPath, TAR_EXCLUDES } from "../backup-paths.js";
import { pruneBackups } from "./list.js";

const execFileAsync = promisify(execFile);

/** Unpack a zip into a temp dir, flatten a single root folder if needed, then write .tar.gz. */
async function convertZipToTarGz(zipPath: string, destTarGz: string): Promise<void> {
  const tmpDir = `${destTarGz}.extract-${process.pid}-${Date.now()}`;
  await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
  try {
    await safeExtractArchive(zipPath, tmpDir);

    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    if (entries.length === 1 && entries[0]!.isDirectory()) {
      const only = path.join(tmpDir, entries[0]!.name);
      const inner = await fs.readdir(only);
      for (const name of inner) {
        await fs.rename(path.join(only, name), path.join(tmpDir, name));
      }
      await fs.rm(only, { recursive: true, force: true });
    }

    await execFileAsync("tar", ["-czf", destTarGz, ...TAR_EXCLUDES, "-C", tmpDir, "."], {
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    await fs.rm(destTarGz, { force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to unpack zip backup: ${message}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function finalizeUploadedBackup(opts: {
  serverId: string;
  backupId: string;
  partialPath: string;
  sizeBytes: number;
  note?: string | null;
  createdAt?: string;
  originalName?: string;
}): Promise<ServerBackup> {
  const { serverId, backupId } = opts;
  await fs.mkdir(serverBackupsDir(serverId), { recursive: true });
  const dest = archivePath(serverId, backupId);
  const lower = (opts.originalName || "").toLowerCase();

  if (lower.endsWith(".zip")) {
    await convertZipToTarGz(opts.partialPath, dest);
    await fs.rm(opts.partialPath, { force: true }).catch(() => undefined);
  } else {
    await fs.rename(opts.partialPath, dest);
  }

  const stPlain = await fs.stat(dest);
  const createdAt = opts.createdAt ?? new Date().toISOString();
  const note = opts.note?.trim() || null;

  let fileName = `${backupId}.tar.gz`;
  let sizeBytes = stPlain.size;
  let encrypted = false;

  if (isBackupEncryptionEnabled()) {
    const sealed = await encryptBackupArchive(dest);
    fileName = path.basename(sealed.encPath);
    sizeBytes = sealed.sizeBytes;
    encrypted = true;
  }

  await fs.writeFile(
    metaPath(serverId, backupId),
    `${JSON.stringify(
      {
        id: backupId,
        note,
        trigger: "uploaded",
        createdAt,
        sizeBytes,
        encrypted,
        originalName: opts.originalName ?? null,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const schedule = await readBackupSchedule(serverId);
  await pruneBackups(serverId, schedule.keepCount);
  return {
    id: backupId,
    fileName,
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    createdAt,
    note,
    trigger: "uploaded",
    encrypted,
  };
}
