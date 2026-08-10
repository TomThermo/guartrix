import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import type { ScheduleStep, ScheduledTask } from "@guartrix/shared";
import {
  computeCronNextRun,
  computeDailyNextRun,
  computeIntervalNextRun,
  computeWeeklyNextRun,
  parseCronExpression,
  parseDailyAt,
} from "../schedule-time.js";

/** Timing + legacy summary fields stored in scheduleJson. */
export interface SchedulePayload {
  mode: ScheduledTask["mode"];
  dailyAt: string;
  intervalHours: number;
  weekdays: number[];
  cronExpression: string;
  kind: ScheduledTask["kind"];
  command: string;
}

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export function computeNextRun(task: ScheduledTask, from = new Date()): string | null {
  if (!task.enabled) return null;
  if (task.mode === "cron") {
    return computeCronNextRun(task.cronExpression || "0 4 * * *", from);
  }
  if (task.mode === "interval") {
    return computeIntervalNextRun(task, from);
  }
  if (task.mode === "weekly") {
    return computeWeeklyNextRun(task.dailyAt || "04:00", task.weekdays ?? [], from, "04:00");
  }
  return computeDailyNextRun(task.dailyAt || "04:00", from, "04:00");
}

export function normalizeStep(raw: Partial<ScheduleStep>): ScheduleStep {
  const kind =
    raw.kind === "restart" || raw.kind === "backup" || raw.kind === "wait" || raw.kind === "command"
      ? raw.kind
      : "command";
  const step: ScheduleStep = { kind };
  if (kind === "command") {
    step.command = (raw.command || "").replace(/^\//, "").trim();
  }
  if (kind === "wait") {
    step.delaySeconds = Math.min(3600, Math.max(1, Number(raw.delaySeconds) || 30));
  }
  if (kind === "command" || kind === "restart") {
    step.onlyIfRunning = raw.onlyIfRunning !== false;
  }
  if (raw.continueOnFailure === true) {
    step.continueOnFailure = true;
  }
  return step;
}

function summarizeKind(steps: ScheduleStep[]): ScheduledTask["kind"] {
  if (steps.length === 0) return "command";
  if (steps.length === 1) {
    const k = steps[0].kind;
    if (k === "wait") return "chain";
    return k;
  }
  return "chain";
}

function firstCommand(steps: ScheduleStep[]): string {
  const cmd = steps.find((s) => s.kind === "command");
  return cmd?.command || "";
}

function normalizeMode(raw: Partial<ScheduledTask>["mode"]): ScheduledTask["mode"] {
  if (raw === "interval" || raw === "weekly" || raw === "cron") return raw;
  return "daily";
}

export function normalizeTask(raw: Partial<ScheduledTask> & { id?: string }): ScheduledTask {
  let steps: ScheduleStep[];
  if (Array.isArray(raw.steps) && raw.steps.length > 0) {
    steps = raw.steps.map((s) => normalizeStep(s));
  } else if (raw.kind === "restart") {
    steps = [normalizeStep({ kind: "restart", onlyIfRunning: true })];
  } else if (raw.kind === "backup") {
    steps = [normalizeStep({ kind: "backup" })];
  } else {
    steps = [
      normalizeStep({
        kind: "command",
        command: raw.command || "",
        onlyIfRunning: true,
      }),
    ];
  }

  const mode = normalizeMode(raw.mode);
  const task: ScheduledTask = {
    id: raw.id || nanoid(10),
    enabled: Boolean(raw.enabled),
    kind: summarizeKind(steps),
    mode,
    dailyAt: raw.dailyAt || "04:00",
    intervalHours: Math.min(168, Math.max(1, Number(raw.intervalHours) || 24)),
    weekdays: mode === "weekly" ? normalizeWeekdays(raw.weekdays) : [],
    cronExpression: (raw.cronExpression || "0 4 * * *").trim(),
    command: firstCommand(steps),
    steps,
    note: raw.note?.trim() || null,
    lastRunAt: raw.lastRunAt ?? null,
    nextRunAt: null,
    lastError: raw.lastError ?? null,
  };
  task.nextRunAt = computeNextRun(task);
  return task;
}

export function validateSteps(steps: ScheduleStep[]): void {
  if (!steps.length) throw new Error("At least one step is required");
  if (steps.length > 20) throw new Error("Too many steps (max 20)");
  for (const step of steps) {
    if (step.kind === "command" && !step.command) {
      throw new Error("Command step requires a command");
    }
    if (step.kind === "wait" && (!step.delaySeconds || step.delaySeconds < 1)) {
      throw new Error("Wait step requires delaySeconds");
    }
  }
  const actionable = steps.some((s) => s.kind !== "wait");
  if (!actionable) throw new Error("Chain must include a non-wait step");
}

export function validateScheduleTiming(task: ScheduledTask): void {
  if (task.mode === "daily" || task.mode === "weekly") {
    if (!parseDailyAt(task.dailyAt || "04:00")) {
      throw new Error("dailyAt must be HH:mm");
    }
  }
  if (task.mode === "weekly" && task.weekdays.length === 0) {
    throw new Error("Select at least one weekday");
  }
  if (task.mode === "cron" && !parseCronExpression(task.cronExpression || "")) {
    throw new Error("cronExpression must be 5 fields (minute hour day month weekday)");
  }
}

export function schedulePayload(task: ScheduledTask): SchedulePayload {
  return {
    mode: task.mode,
    dailyAt: task.dailyAt,
    intervalHours: task.intervalHours,
    weekdays: task.weekdays,
    cronExpression: task.cronExpression,
    kind: task.kind,
    command: task.command,
  };
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function rowToTask(row: {
  id: string;
  name: string;
  enabled: boolean;
  scheduleJson: Prisma.JsonValue;
  stepsJson: Prisma.JsonValue;
  lastRunAt: Date | null;
  lastError: string | null;
  nextRunAt: Date | null;
}): ScheduledTask {
  const schedule = (row.scheduleJson ?? {}) as Partial<SchedulePayload>;
  const rawSteps = Array.isArray(row.stepsJson) ? (row.stepsJson as Partial<ScheduleStep>[]) : [];
  const task = normalizeTask({
    id: row.id,
    enabled: row.enabled,
    mode: schedule.mode,
    dailyAt: schedule.dailyAt,
    intervalHours: schedule.intervalHours,
    weekdays: schedule.weekdays,
    cronExpression: schedule.cronExpression,
    kind: schedule.kind,
    command: schedule.command,
    steps: rawSteps.map((s) => normalizeStep(s)),
    note: row.name?.trim() || null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastError: row.lastError,
  });
  // Due ticks and UI must honor the persisted nextRunAt (normalizeTask recomputes from "now").
  if (row.nextRunAt) {
    task.nextRunAt = row.nextRunAt.toISOString();
  }
  return task;
}

export function describeScheduleSteps(steps: ScheduleStep[]): string {
  return steps
    .map((s) => {
      if (s.kind === "command") return `/${s.command || "…"}`;
      if (s.kind === "restart") return "restart";
      if (s.kind === "backup") return "backup";
      return `wait ${s.delaySeconds || 0}s`;
    })
    .join(" → ");
}
