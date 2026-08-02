/** Shared schedule timing helpers for backups and scheduled tasks. */

export function parseDailyAt(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export type IntervalScheduleInput = {
  mode: "interval" | string;
  intervalHours?: number;
  lastRunAt?: string | null;
};

export type DailyScheduleInput = {
  mode: "daily" | "weekly" | string;
  dailyAt?: string;
  weekdays?: number[];
  enabled?: boolean;
};

/** Next run for interval schedules (first run ~1 minute after enable). */
export function computeIntervalNextRun(
  schedule: IntervalScheduleInput,
  from = new Date(),
): string | null {
  if (schedule.mode !== "interval") return null;
  const hours = Math.min(168, Math.max(1, schedule.intervalHours || 6));
  if (!schedule.lastRunAt) {
    return new Date(from.getTime() + 60_000).toISOString();
  }
  const base = new Date(schedule.lastRunAt);
  return new Date(
    Math.max(base.getTime() + hours * 3600_000, from.getTime() + 60_000),
  ).toISOString();
}

/** Next daily (or next calendar day) run at HH:mm. */
export function computeDailyNextRun(
  dailyAt: string,
  from = new Date(),
  defaultAt = "03:00",
): string | null {
  const parsed = parseDailyAt(dailyAt || defaultAt);
  if (!parsed) return null;
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(parsed.hour, parsed.minute, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

/** Next weekly run on one of the given weekdays (0=Sun … 6=Sat) at HH:mm. */
export function computeWeeklyNextRun(
  dailyAt: string,
  weekdays: number[],
  from = new Date(),
  defaultAt = "04:00",
): string | null {
  const parsed = parseDailyAt(dailyAt || defaultAt);
  if (!parsed) return null;
  const days = weekdays?.length ? weekdays : [];
  if (!days.length) return null;
  const daySet = new Set(days);
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + i);
    candidate.setHours(parsed.hour, parsed.minute, 0, 0);
    if (!daySet.has(candidate.getDay())) continue;
    if (candidate.getTime() > from.getTime()) return candidate.toISOString();
  }
  return null;
}
