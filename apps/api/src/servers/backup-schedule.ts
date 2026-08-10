import fs from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule, BackupScheduleMode } from "@guartrix/shared";
import { clampBackupKeepCount } from "@guartrix/shared";
import { serverBackupsDir } from "../config.js";
import { prisma } from "../db.js";
import {
  computeCronNextRun,
  computeDailyNextRun,
  computeIntervalNextRun,
  parseCronExpression,
  parseDailyAt,
} from "./schedule-time.js";

function schedulePath(serverId: string): string {
  return path.join(serverBackupsDir(serverId), "schedule.json");
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

function normalizeMode(raw: string | undefined): BackupScheduleMode {
  if (raw === "daily" || raw === "interval" || raw === "cron") return raw;
  return "off";
}

export function computeBackupNextRun(schedule: BackupSchedule, from = new Date()): string | null {
  if (schedule.mode === "off") return null;

  if (schedule.mode === "interval") {
    return computeIntervalNextRun(schedule, from);
  }
  if (schedule.mode === "cron") {
    return computeCronNextRun(schedule.cronExpression || "0 3 * * *", from);
  }

  return computeDailyNextRun(schedule.dailyAt || "03:00", from, "03:00");
}

function rowToSchedule(row: {
  mode: string;
  intervalHours: number;
  dailyAt: string;
  cronExpression: string;
  keepCount: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}): BackupSchedule {
  const merged: BackupSchedule = {
    mode: normalizeMode(row.mode),
    intervalHours: Number(row.intervalHours) || 6,
    dailyAt: row.dailyAt || "03:00",
    cronExpression: row.cronExpression || "0 3 * * *",
    keepCount: Number(row.keepCount) || 7,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
  };
  if (merged.mode !== "off" && !merged.nextRunAt) {
    merged.nextRunAt = computeBackupNextRun(merged);
  }
  return merged;
}

async function readScheduleFromFile(serverId: string): Promise<BackupSchedule | null> {
  try {
    const raw = await fs.readFile(schedulePath(serverId), "utf8");
    const data = JSON.parse(raw) as Partial<BackupSchedule>;
    const merged: BackupSchedule = {
      ...defaultSchedule(),
      ...data,
      mode: normalizeMode(data.mode),
      intervalHours: Number(data.intervalHours) || 6,
      dailyAt: data.dailyAt || "03:00",
      cronExpression: data.cronExpression || "0 3 * * *",
      keepCount: Number(data.keepCount) || 7,
      lastRunAt: data.lastRunAt ?? null,
      nextRunAt: data.nextRunAt ?? null,
    };
    if (merged.mode !== "off" && !merged.nextRunAt) {
      merged.nextRunAt = computeBackupNextRun(merged);
    }
    return merged;
  } catch {
    return null;
  }
}

async function writeScheduleFile(serverId: string, schedule: BackupSchedule): Promise<void> {
  try {
    await fs.mkdir(serverBackupsDir(serverId), { recursive: true });
    await fs.writeFile(schedulePath(serverId), `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
  } catch {
    // Dual-write is best-effort; DB is source of truth for due ticks.
  }
}

async function upsertScheduleRow(serverId: string, schedule: BackupSchedule): Promise<void> {
  await prisma.backupSchedule.upsert({
    where: { serverId },
    create: {
      serverId,
      mode: schedule.mode,
      intervalHours: schedule.intervalHours,
      dailyAt: schedule.dailyAt || "03:00",
      cronExpression: schedule.cronExpression || "0 3 * * *",
      keepCount: schedule.keepCount,
      lastRunAt: schedule.lastRunAt ? new Date(schedule.lastRunAt) : null,
      nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
    },
    update: {
      mode: schedule.mode,
      intervalHours: schedule.intervalHours,
      dailyAt: schedule.dailyAt || "03:00",
      cronExpression: schedule.cronExpression || "0 3 * * *",
      keepCount: schedule.keepCount,
      lastRunAt: schedule.lastRunAt ? new Date(schedule.lastRunAt) : null,
      nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
    },
  });
}

export async function readBackupSchedule(serverId: string): Promise<BackupSchedule> {
  const row = await prisma.backupSchedule.findUnique({ where: { serverId } });
  if (row) return rowToSchedule(row);

  const fromFile = await readScheduleFromFile(serverId);
  if (fromFile) {
    await upsertScheduleRow(serverId, fromFile).catch(() => undefined);
    return fromFile;
  }
  return defaultSchedule();
}

export async function writeBackupSchedule(
  serverId: string,
  patch: Partial<BackupSchedule>,
): Promise<BackupSchedule> {
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
  next.keepCount = clampBackupKeepCount(next.keepCount);

  const retentionOnly =
    patch.keepCount !== undefined &&
    patch.mode === undefined &&
    patch.intervalHours === undefined &&
    patch.dailyAt === undefined &&
    patch.cronExpression === undefined &&
    patch.lastRunAt === undefined &&
    patch.nextRunAt === undefined;

  if (next.mode === "off") {
    next.nextRunAt = null;
  } else if (retentionOnly) {
    next.nextRunAt = current.nextRunAt;
    next.lastRunAt = current.lastRunAt;
  } else if (
    patch.nextRunAt !== undefined &&
    patch.nextRunAt !== null &&
    !patch.mode &&
    !patch.dailyAt &&
    !patch.intervalHours &&
    !patch.cronExpression &&
    !patch.lastRunAt
  ) {
    // Explicit nextRunAt patch (e.g. failure backoff) — keep as provided.
    next.nextRunAt = patch.nextRunAt;
  } else {
    next.nextRunAt = computeBackupNextRun(next, new Date());
  }

  await upsertScheduleRow(serverId, next);
  await writeScheduleFile(serverId, next);
  return next;
}

/** One-shot: import file schedules that are not yet in DB (boot / migrate). */
export async function migrateBackupSchedulesFromFiles(serverIds: string[]): Promise<number> {
  let imported = 0;
  for (const serverId of serverIds) {
    const existing = await prisma.backupSchedule.findUnique({
      where: { serverId },
      select: { serverId: true },
    });
    if (existing) continue;
    const fromFile = await readScheduleFromFile(serverId);
    if (!fromFile || fromFile.mode === "off") continue;
    await upsertScheduleRow(serverId, fromFile);
    imported += 1;
  }
  return imported;
}

function dueBatchSize(): number {
  const raw = Number(process.env.SCHEDULER_BACKUP_BATCH ?? 50);
  if (!Number.isFinite(raw) || raw < 1) return 50;
  return Math.min(500, Math.floor(raw));
}

/** Due backup schedules via indexed DB query (no per-server file walk). */
export async function listDueBackupScheduleServerIds(now = new Date()): Promise<string[]> {
  const rows = await prisma.backupSchedule.findMany({
    where: {
      mode: { not: "off" },
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: "asc" },
    take: dueBatchSize(),
    select: { serverId: true },
  });
  return rows.map((r) => r.serverId);
}

/** Set initial backup retention when a server is provisioned. */
export async function applyInitialBackupRetention(
  serverId: string,
  keepCount?: number,
): Promise<BackupSchedule> {
  const { config } = await import("../config.js");
  const count = clampBackupKeepCount(keepCount ?? config.defaultBackupKeepCount);
  return writeBackupSchedule(serverId, { keepCount: count });
}
