import fs from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule, BackupScheduleMode } from "@msm/shared";
import { serverBackupsDir } from "../config.js";
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

export function computeBackupNextRun(
  schedule: BackupSchedule,
  from = new Date(),
): string | null {
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
      merged.nextRunAt = computeBackupNextRun(merged);
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
    next.nextRunAt = computeBackupNextRun(next, new Date());
  }

  await fs.writeFile(schedulePath(serverId), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
