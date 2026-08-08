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

/** Validate standard 5-field cron (minute hour dom month dow). */
export function parseCronExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((field) => field.length > 0 && field.length <= 64);
}

function cronFieldMatches(field: string, value: number, _min: number, _max: number): boolean {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = Number(field.slice(2));
    if (!Number.isFinite(step) || step < 1) return false;
    return value % step === 0;
  }
  for (const part of field.split(",")) {
    if (part.includes("-")) {
      const [a, b] = part.split("-", 2);
      const lo = Number(a);
      const hi = Number(b);
      if (Number.isFinite(lo) && Number.isFinite(hi) && value >= lo && value <= hi) {
        return true;
      }
    } else if (Number(part) === value) {
      return true;
    }
  }
  return false;
}

/** Next run for cron expression (minute hour dom month dow). Scans up to ~366 days. */
export function computeCronNextRun(cronExpression: string, from = new Date()): string | null {
  if (!parseCronExpression(cronExpression)) return null;
  const [minF, hourF, domF, monF, dowF] = cronExpression.trim().split(/\s+/);
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    const minute = cursor.getMinutes();
    const hour = cursor.getHours();
    const dom = cursor.getDate();
    const month = cursor.getMonth() + 1;
    const dow = cursor.getDay();
    if (
      cronFieldMatches(minF, minute, 0, 59) &&
      cronFieldMatches(hourF, hour, 0, 23) &&
      cronFieldMatches(domF, dom, 1, 31) &&
      cronFieldMatches(monF, month, 1, 12) &&
      cronFieldMatches(dowF, dow, 0, 6)
    ) {
      return cursor.toISOString();
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}
