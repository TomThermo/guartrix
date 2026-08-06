import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  BackupSchedule,
  BackupScheduleMode,
  ServerBackup,
} from "@msm/shared";
import { formatBytes } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import {
  decryptBackupArchive,
  encryptBackupArchive,
  isBackupEncryptionEnabled,
  isEncryptedBackupPath,
} from "./backup-crypto.js";
import { serverBackupsDir, serverDir, config } from "../config.js";
import { logger } from "../logger.js";
import { prisma } from "../db.js";
import { processManager } from "./process-manager.js";
import { safeExtractArchive } from "@msm/node-agent";
import {
  computeCronNextRun,
  computeDailyNextRun,
  computeIntervalNextRun,
  parseCronExpression,
  parseDailyAt,
} from "./schedule-time.js";

const MYSQL_BACKUP_DIR = "guartrix-mysql";

const execFileAsync = promisify(execFile);

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Reject shell metacharacters outside known placeholders in operator templates. */
function assertSafeOffsiteTemplate(template: string): void {
  const stripped = template
    .replaceAll("{path}", "")
    .replaceAll("{serverId}", "")
    .replaceAll("{backupId}", "")
    .replaceAll("{fileName}", "");
  if (/[;|&$`<>]/.test(stripped)) {
    throw new Error(
      "BACKUP_OFFSITE_CMD contains disallowed shell metacharacters outside placeholders",
    );
  }
}

/**
 * Optional offsite copy after a successful backup.
 * Set BACKUP_OFFSITE_CMD to a shell command; placeholders:
 *   {path} {serverId} {backupId} {fileName}
 * Example: rclone copy "{path}" b2:guartrix-backups/{serverId}/
 */
async function runOffsiteBackupHook(opts: {
  archivePath: string;
  serverId: string;
  backupId: string;
  fileName: string;
}): Promise<void> {
  const template = config.backupOffsiteCmd?.trim();
  if (!template) return;
  assertSafeOffsiteTemplate(template);
  const cmd = template
    .replaceAll("{path}", shellSingleQuote(opts.archivePath))
    .replaceAll("{serverId}", shellSingleQuote(opts.serverId))
    .replaceAll("{backupId}", shellSingleQuote(opts.backupId))
    .replaceAll("{fileName}", shellSingleQuote(opts.fileName));
  try {
    await execFileAsync("bash", ["-c", cmd], {
      timeout: 10 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    logger.info(
      { serverId: opts.serverId, backupId: opts.backupId },
      "offsite backup hook completed",
    );
  } catch (err) {
    logger.warn(
      { err, serverId: opts.serverId, backupId: opts.backupId },
      "offsite backup hook failed",
    );
  }
}

const TAR_EXCLUDES = [
  "--exclude=logs",
  "--exclude=crash-reports",
  "--exclude=*.log",
  "--exclude=cache",
  "--exclude=.cache",
  "--exclude=versions",
  "--exclude=libraries",
  "--exclude=.fabric",
  "--exclude=session.lock",
];

const busyServers = new Set<string>();

/** Backup ids are ISO-like timestamps (e.g. 2026-08-06T13-45-00-000Z) — never path segments. */
export function assertSafeBackupId(backupId: string): void {
  if (!backupId || !/^[A-Za-z0-9._-]{1,128}$/.test(backupId) || backupId.includes("..")) {
    throw new Error("Invalid backup id");
  }
}

export function formatBackupSize(bytes: number): string {
  return formatBytes(bytes);
}

function schedulePath(serverId: string): string {
  return path.join(serverBackupsDir(serverId), "schedule.json");
}

function metaPath(serverId: string, backupId: string): string {
  assertSafeBackupId(backupId);
  return path.join(serverBackupsDir(serverId), `${backupId}.json`);
}

function archivePath(serverId: string, backupId: string): string {
  assertSafeBackupId(backupId);
  return path.join(serverBackupsDir(serverId), `${backupId}.tar.gz`);
}

function encryptedPath(serverId: string, backupId: string): string {
  assertSafeBackupId(backupId);
  return path.join(serverBackupsDir(serverId), `${backupId}.tar.gz.enc`);
}

/** Resolve on-disk archive path (plain or encrypted). */
export async function resolveBackupArchivePath(
  serverId: string,
  backupId: string,
): Promise<{ path: string; encrypted: boolean }> {
  assertSafeBackupId(backupId);
  const root = path.resolve(serverBackupsDir(serverId));
  const enc = path.resolve(encryptedPath(serverId, backupId));
  const plain = path.resolve(archivePath(serverId, backupId));
  if (!enc.startsWith(root + path.sep) || !plain.startsWith(root + path.sep)) {
    throw new Error("Invalid backup id");
  }
  try {
    await fs.access(enc);
    return { path: enc, encrypted: true };
  } catch {
    // continue
  }
  try {
    await fs.access(plain);
    return { path: plain, encrypted: false };
  } catch {
    throw new Error("Backup not found");
  }
}

function defaultSchedule(): BackupSchedule {
  return {
    mode: "off",
    intervalHours: 6,
    dailyAt: "03:00",
    cronExpression: "0 3 * * *",
    keepCount: 7,
    lastRunAt: null,
    nextRunAt: null,
  };
}

async function embedMysqlDumpsInArchive(
  serverId: string,
  archivePath: string,
): Promise<void> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { nodeId: true },
  });
  if (!server) return;
  const dbs = await prisma.database.findMany({
    where: { serverId },
    select: { name: true },
  });
  if (dbs.length === 0) return;

  const stage = `${archivePath}.mysql-stage-${process.pid}`;
  await fs.mkdir(stage, { recursive: true });
  try {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", stage], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const mysqlDir = path.join(stage, MYSQL_BACKUP_DIR);
    await fs.mkdir(mysqlDir, { recursive: true });
    const { daemonMysqlDumpToFile } = await import("../nodes/daemon-client.js");
    for (const db of dbs) {
      const dumpPath = path.join(mysqlDir, `${db.name}.sql`);
      await daemonMysqlDumpToFile(server.nodeId, db.name, dumpPath);
    }
    await fs.writeFile(
      path.join(mysqlDir, "manifest.json"),
      `${JSON.stringify({ version: 1, databases: dbs.map((d) => d.name) }, null, 2)}\n`,
      "utf8",
    );
    const repacked = `${archivePath}.repack`;
    await execFileAsync(
      "tar",
      ["-czf", repacked, ...TAR_EXCLUDES, "-C", stage, "."],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    await fs.rename(repacked, archivePath);
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function restoreMysqlFromBackupDir(
  serverId: string,
  dest: string,
): Promise<void> {
  const mysqlDir = path.join(dest, MYSQL_BACKUP_DIR);
  try {
    await fs.access(mysqlDir);
  } catch {
    return;
  }
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { nodeId: true },
  });
  if (!server) return;
  let databases: string[] = [];
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(mysqlDir, "manifest.json"), "utf8"),
    ) as { databases?: string[] };
    databases = Array.isArray(manifest.databases) ? manifest.databases : [];
  } catch {
    const entries = await fs.readdir(mysqlDir);
    databases = entries
      .filter((n) => n.endsWith(".sql"))
      .map((n) => n.replace(/\.sql$/, ""));
  }
  const { daemonMysqlRestoreFromFile } = await import("../nodes/daemon-client.js");
  for (const name of databases) {
    const sqlPath = path.join(mysqlDir, `${name}.sql`);
    try {
      await fs.access(sqlPath);
      await daemonMysqlRestoreFromFile(server.nodeId, name, sqlPath);
    } catch (err) {
      logger.warn({ err, serverId, name }, "mysql restore from backup failed");
    }
  }
  await fs.rm(mysqlDir, { recursive: true, force: true }).catch(() => undefined);
}

function computeNextRun(schedule: BackupSchedule, from = new Date()): string | null {
  if (schedule.mode === "off") return null;

  if (schedule.mode === "interval") {
    return computeIntervalNextRun(schedule, from);
  }
  if (schedule.mode === "cron") {
    return computeCronNextRun(schedule.cronExpression || "0 3 * * *", from);
  }

  return computeDailyNextRun(schedule.dailyAt || "03:00", from, "03:00");
}

export async function readBackupSchedule(serverId: string): Promise<BackupSchedule> {
  try {
    const raw = await fs.readFile(schedulePath(serverId), "utf8");
    const data = JSON.parse(raw) as Partial<BackupSchedule>;
    const merged: BackupSchedule = {
      ...defaultSchedule(),
      ...data,
      mode: (data.mode as BackupScheduleMode) || "off",
      intervalHours: Number(data.intervalHours) || 6,
      dailyAt: data.dailyAt || "03:00",
      cronExpression: data.cronExpression || "0 3 * * *",
      keepCount: Number(data.keepCount) || 7,
      lastRunAt: data.lastRunAt ?? null,
      nextRunAt: data.nextRunAt ?? null,
    };
    if (merged.mode !== "off" && !merged.nextRunAt) {
      merged.nextRunAt = computeNextRun(merged);
    }
    return merged;
  } catch {
    return defaultSchedule();
  }
}

export async function writeBackupSchedule(
  serverId: string,
  patch: Partial<BackupSchedule>,
): Promise<BackupSchedule> {
  await fs.mkdir(serverBackupsDir(serverId), { recursive: true });
  const current = await readBackupSchedule(serverId);
  const next: BackupSchedule = {
    ...current,
    ...patch,
  };

  if (next.mode === "interval") {
    next.intervalHours = Math.min(168, Math.max(1, Number(next.intervalHours) || 6));
  }
  if (next.mode === "daily") {
    if (!parseDailyAt(next.dailyAt)) {
      throw new Error("dailyAt must be HH:mm (24h)");
    }
  }
  if (next.mode === "cron") {
    if (!parseCronExpression(next.cronExpression || "")) {
      throw new Error("cronExpression must be 5 fields (minute hour day month weekday)");
    }
  }
  next.keepCount = Math.min(50, Math.max(1, Number(next.keepCount) || 7));

  if (next.mode === "off") {
    next.nextRunAt = null;
  } else {
    // Recalculate next run from now (or last run for interval).
    next.nextRunAt = computeNextRun(next, new Date());
  }

  await fs.writeFile(schedulePath(serverId), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

function isBusy(serverId: string): boolean {
  return busyServers.has(serverId);
}

export function isBackupBusy(serverId: string): boolean {
  return isBusy(serverId);
}

export async function listBackups(serverId: string): Promise<ServerBackup[]> {
  const dir = serverBackupsDir(serverId);
  await fs.mkdir(dir, { recursive: true });
  const names = await fs.readdir(dir);
  const backups: ServerBackup[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const encrypted = name.endsWith(".tar.gz.enc");
    const plain = name.endsWith(".tar.gz") && !encrypted;
    if (!encrypted && !plain) continue;
    const id = encrypted
      ? name.replace(/\.tar\.gz\.enc$/, "")
      : name.replace(/\.tar\.gz$/, "");
    if (seen.has(id)) continue;
    seen.add(id);

    const archive = path.join(dir, name);
    const st = await fs.stat(archive).catch(() => null);
    if (!st) continue;

    let note: string | null = null;
    let trigger: ServerBackup["trigger"] = "manual";
    let createdAt = st.mtime.toISOString();
    let metaEncrypted = encrypted;
    try {
      const meta = JSON.parse(await fs.readFile(metaPath(serverId, id), "utf8")) as {
        note?: string | null;
        trigger?: ServerBackup["trigger"];
        createdAt?: string;
        encrypted?: boolean;
      };
      note = meta.note ?? null;
      trigger = meta.trigger ?? "manual";
      createdAt = meta.createdAt ?? createdAt;
      if (typeof meta.encrypted === "boolean") metaEncrypted = meta.encrypted;
    } catch {
      // no meta
    }

    backups.push({
      id,
      fileName: name,
      sizeBytes: st.size,
      sizeLabel: formatBytes(st.size),
      createdAt,
      note,
      trigger,
      encrypted: metaEncrypted || encrypted,
    });
  }

  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups;
}

async function pruneBackups(serverId: string, keepCount: number): Promise<void> {
  const backups = await listBackups(serverId);
  const extra = backups.slice(Math.max(1, keepCount));
  for (const b of extra) {
    await fs.rm(archivePath(serverId, b.id), { force: true }).catch(() => undefined);
    await fs.rm(encryptedPath(serverId, b.id), { force: true }).catch(() => undefined);
    await fs.rm(metaPath(serverId, b.id), { force: true }).catch(() => undefined);
  }
}

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
  if (busyServers.has(serverId)) {
    throw new Error("A backup is already running for this server");
  }

  busyServers.add(serverId);
  try {
    await fs.mkdir(serverBackupsDir(serverId), { recursive: true });
    await flushWorldIfRunning(serverId);

    const createdAt = new Date();
    const id = createdAt.toISOString().replace(/[:.]/g, "-");
    const dest = archivePath(serverId, id);

    // Prefer daemon export so remote-node worlds are included (panel DATA_DIR may be empty).
    try {
      const { daemonExportArchiveToFile } = await import("../nodes/daemon-client.js");
      await daemonExportArchiveToFile(serverId, dest);
    } catch (daemonErr) {
      const source = serverDir(serverId);
      try {
        await fs.access(source);
      } catch {
        throw daemonErr instanceof Error
          ? daemonErr
          : new Error("Server data folder not found");
      }
      await execFileAsync(
        "tar",
        ["-czf", dest, ...TAR_EXCLUDES, "-C", source, "."],
        { maxBuffer: 16 * 1024 * 1024 },
      );
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
      JSON.stringify(
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
      ) + "\n",
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
    busyServers.delete(serverId);
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
    JSON.stringify(
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
    ) + "\n",
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

    await execFileAsync(
      "tar",
      ["-czf", destTarGz, ...TAR_EXCLUDES, "-C", tmpDir, "."],
      { maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (err) {
    await fs.rm(destTarGz, { force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to unpack zip backup: ${message}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function restoreBackup(opts: {
  serverId: string;
  backupId: string;
}): Promise<void> {
  const { serverId, backupId } = opts;
  if (busyServers.has(serverId)) {
    throw new Error("A backup operation is already running for this server");
  }
  if (processManager.isRunning(serverId)) {
    throw new Error("Stop the server before restoring a backup");
  }

  const { path: archive, encrypted } = await resolveBackupArchivePath(
    serverId,
    backupId,
  );
  const dest = serverDir(serverId);

  busyServers.add(serverId);
  let plainTmp: string | null = null;
  try {
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
    busyServers.delete(serverId);
  }
}

export async function deleteBackup(serverId: string, backupId: string): Promise<void> {
  const { path: archive } = await resolveBackupArchivePath(serverId, backupId);
  await fs.rm(archive, { force: true });
  await fs.rm(archivePath(serverId, backupId), { force: true }).catch(() => undefined);
  await fs.rm(encryptedPath(serverId, backupId), { force: true }).catch(() => undefined);
  await fs.rm(metaPath(serverId, backupId), { force: true }).catch(() => undefined);
}

export async function getBackupFilePath(
  serverId: string,
  backupId: string,
): Promise<string> {
  const { path: file } = await resolveBackupArchivePath(serverId, backupId);
  return file;
}

export async function assertBackupExists(
  serverId: string,
  backupId: string,
): Promise<string> {
  const { path: file } = await resolveBackupArchivePath(serverId, backupId);
  return file;
}

/** Run due scheduled backups for all known server ids that have schedules. */
export async function runDueBackupSchedules(
  serverIds: string[],
): Promise<{ serverId: string; backupId: string }[]> {
  const done: { serverId: string; backupId: string }[] = [];
  const now = Date.now();

  for (const serverId of serverIds) {
    if (busyServers.has(serverId)) continue;
    const schedule = await readBackupSchedule(serverId);
    if (schedule.mode === "off" || !schedule.nextRunAt) continue;
    if (new Date(schedule.nextRunAt).getTime() > now) continue;

    try {
      const backup = await createBackup({
        serverId,
        trigger: "scheduled",
        note: schedule.mode === "daily" ? `Daily ${schedule.dailyAt}` : `Every ${schedule.intervalHours}h`,
      });
      done.push({ serverId, backupId: backup.id });
      logActivity({
        action: "backup.create",
        actor: "scheduler",
        serverId,
        metadata: {
          backupId: backup.id,
          size: backup.sizeLabel,
          trigger: "scheduled",
        },
      });
    } catch (err) {
      // Push next attempt 15 minutes out so we don't spin on failure.
      await writeBackupSchedule(serverId, {
        nextRunAt: new Date(now + 15 * 60_000).toISOString(),
      }).catch(() => undefined);
      console.error(`[backups] scheduled backup failed for ${serverId}:`, err);
      logActivity({
        action: "backup.failed",
        actor: "scheduler",
        serverId,
        success: false,
        metadata: {
          trigger: "scheduled",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return done;
}
