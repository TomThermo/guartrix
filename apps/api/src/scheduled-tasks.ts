import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import type { ScheduleStep, ScheduledTask } from "@msm/shared";
import { logActivity } from "./activity-log.js";
import { serverDir } from "./config.js";
import { prisma } from "./db.js";
import { processManager } from "./process-manager.js";
import {
  computeDailyNextRun,
  computeIntervalNextRun,
  computeWeeklyNextRun,
  parseDailyAt,
} from "./schedule-time.js";

function tasksJsonPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-scheduled-tasks.json");
}

/** Timing + legacy summary fields stored in scheduleJson. */
interface SchedulePayload {
  mode: ScheduledTask["mode"];
  dailyAt: string;
  intervalHours: number;
  weekdays: number[];
  kind: ScheduledTask["kind"];
  command: string;
}

const migratedServers = new Set<string>();

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function computeNextRun(task: ScheduledTask, from = new Date()): string | null {
  if (!task.enabled) return null;
  if (task.mode === "interval") {
    return computeIntervalNextRun(task, from);
  }
  if (task.mode === "weekly") {
    return computeWeeklyNextRun(
      task.dailyAt || "04:00",
      task.weekdays ?? [],
      from,
      "04:00",
    );
  }
  return computeDailyNextRun(task.dailyAt || "04:00", from, "04:00");
}

function normalizeStep(raw: Partial<ScheduleStep>): ScheduleStep {
  const kind =
    raw.kind === "restart" ||
    raw.kind === "backup" ||
    raw.kind === "wait" ||
    raw.kind === "command"
      ? raw.kind
      : "command";
  const step: ScheduleStep = { kind };
  if (kind === "command") {
    step.command = (raw.command || "").replace(/^\//, "").trim();
  }
  if (kind === "wait") {
    step.delaySeconds = Math.min(
      3600,
      Math.max(1, Number(raw.delaySeconds) || 30),
    );
  }
  if (kind === "command" || kind === "restart") {
    step.onlyIfRunning = raw.onlyIfRunning !== false;
  }
  if (raw.continueOnFailure === true) {
    step.continueOnFailure = true;
  }
  return step;
}

function summarizeKind(
  steps: ScheduleStep[],
): ScheduledTask["kind"] {
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

function normalizeMode(
  raw: Partial<ScheduledTask>["mode"],
): ScheduledTask["mode"] {
  if (raw === "interval" || raw === "weekly") return raw;
  return "daily";
}

function normalizeTask(raw: Partial<ScheduledTask> & { id?: string }): ScheduledTask {
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

function validateSteps(steps: ScheduleStep[]): void {
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

function validateScheduleTiming(task: ScheduledTask): void {
  if (task.mode === "daily" || task.mode === "weekly") {
    if (!parseDailyAt(task.dailyAt || "04:00")) {
      throw new Error("dailyAt must be HH:mm");
    }
  }
  if (task.mode === "weekly" && task.weekdays.length === 0) {
    throw new Error("Select at least one weekday");
  }
}

function schedulePayload(task: ScheduledTask): SchedulePayload {
  return {
    mode: task.mode,
    dailyAt: task.dailyAt,
    intervalHours: task.intervalHours,
    weekdays: task.weekdays,
    kind: task.kind,
    command: task.command,
  };
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowToTask(row: {
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
  const rawSteps = Array.isArray(row.stepsJson)
    ? (row.stepsJson as Partial<ScheduleStep>[])
    : [];
  return normalizeTask({
    id: row.id,
    enabled: row.enabled,
    mode: schedule.mode,
    dailyAt: schedule.dailyAt,
    intervalHours: schedule.intervalHours,
    weekdays: schedule.weekdays,
    kind: schedule.kind,
    command: schedule.command,
    steps: rawSteps.map((s) => normalizeStep(s)),
    note: row.name?.trim() || null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastError: row.lastError,
  });
}

async function readJsonFileTasks(
  serverId: string,
): Promise<Partial<ScheduledTask>[] | null> {
  try {
    const raw = await fs.readFile(tasksJsonPath(serverId), "utf8");
    const data = JSON.parse(raw) as { tasks?: Partial<ScheduledTask>[] };
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    console.warn(
      `[tasks] failed reading JSON for ${serverId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function renameJsonMigrated(serverId: string): Promise<void> {
  const src = tasksJsonPath(serverId);
  const dest = `${src}.migrated`;
  try {
    await fs.rename(src, dest);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(
        `[tasks] could not rename ${src} → .migrated:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

/**
 * One-shot import: if the legacy JSON file exists and this server has no DB
 * rows yet, insert tasks then rename the file to `.migrated`.
 */
export async function migrateScheduledTasksFromJson(
  serverId: string,
): Promise<number> {
  if (migratedServers.has(serverId)) return 0;

  const existing = await prisma.scheduledTask.count({ where: { serverId } });
  if (existing > 0) {
    migratedServers.add(serverId);
    // DB already has rows — still rename leftover JSON so we don't re-read it.
    const leftover = await readJsonFileTasks(serverId);
    if (leftover !== null) await renameJsonMigrated(serverId);
    return 0;
  }

  const rawTasks = await readJsonFileTasks(serverId);
  if (rawTasks === null) {
    migratedServers.add(serverId);
    return 0;
  }

  const tasks = rawTasks.map((t) => normalizeTask(t));
  if (tasks.length > 0) {
    await prisma.scheduledTask.createMany({
      data: tasks.map((task) => ({
        id: task.id,
        serverId,
        name: task.note || "",
        enabled: task.enabled,
        scheduleJson: schedulePayload(task) as unknown as Prisma.InputJsonValue,
        stepsJson: task.steps as unknown as Prisma.InputJsonValue,
        lastRunAt: parseIsoDate(task.lastRunAt),
        lastError: task.lastError,
        nextRunAt: parseIsoDate(task.nextRunAt),
      })),
      skipDuplicates: true,
    });
  }

  await renameJsonMigrated(serverId);
  migratedServers.add(serverId);
  return tasks.length;
}

/** Boot: import JSON schedules for every server that still has a file. */
export async function migrateAllScheduledTasksFromJson(): Promise<number> {
  const servers = await prisma.server.findMany({ select: { id: true } });
  let total = 0;
  for (const { id } of servers) {
    try {
      total += await migrateScheduledTasksFromJson(id);
    } catch (err) {
      console.warn(
        `[tasks] JSON→DB migrate failed for ${id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return total;
}

export async function listScheduledTasks(serverId: string): Promise<ScheduledTask[]> {
  await migrateScheduledTasksFromJson(serverId);
  const rows = await prisma.scheduledTask.findMany({ where: { serverId } });
  const tasks = rows.map(rowToTask);
  return tasks.sort((a, b) => (a.nextRunAt || "").localeCompare(b.nextRunAt || ""));
}

async function upsertTaskRow(serverId: string, task: ScheduledTask): Promise<void> {
  const data = {
    name: task.note || "",
    enabled: task.enabled,
    scheduleJson: schedulePayload(task) as unknown as Prisma.InputJsonValue,
    stepsJson: task.steps as unknown as Prisma.InputJsonValue,
    lastRunAt: parseIsoDate(task.lastRunAt),
    lastError: task.lastError,
    nextRunAt: parseIsoDate(task.nextRunAt),
  };
  await prisma.scheduledTask.upsert({
    where: { id: task.id },
    create: { id: task.id, serverId, ...data },
    update: data,
  });
}

export async function createScheduledTask(
  serverId: string,
  input: Partial<ScheduledTask>,
): Promise<ScheduledTask> {
  await migrateScheduledTasksFromJson(serverId);
  const task = normalizeTask({ ...input, enabled: input.enabled ?? true });
  validateSteps(task.steps);
  validateScheduleTiming(task);
  await upsertTaskRow(serverId, task);
  return task;
}

export async function updateScheduledTask(
  serverId: string,
  taskId: string,
  patch: Partial<ScheduledTask>,
): Promise<ScheduledTask> {
  await migrateScheduledTasksFromJson(serverId);
  const row = await prisma.scheduledTask.findFirst({
    where: { id: taskId, serverId },
  });
  if (!row) throw new Error("Task not found");
  const next = normalizeTask({ ...rowToTask(row), ...patch, id: taskId });
  validateSteps(next.steps);
  validateScheduleTiming(next);
  await upsertTaskRow(serverId, next);
  return next;
}

export async function deleteScheduledTask(serverId: string, taskId: string): Promise<void> {
  await migrateScheduledTasksFromJson(serverId);
  const result = await prisma.scheduledTask.deleteMany({
    where: { id: taskId, serverId },
  });
  if (result.count === 0) throw new Error("Task not found");
}

async function markTaskRun(
  serverId: string,
  task: ScheduledTask,
  lastError: string | null,
): Promise<void> {
  const now = new Date();
  const withRun = normalizeTask({
    ...task,
    lastRunAt: now.toISOString(),
    lastError,
  });
  await prisma.scheduledTask.updateMany({
    where: { id: task.id, serverId },
    data: {
      lastRunAt: now,
      lastError,
      nextRunAt: parseIsoDate(withRun.nextRunAt),
      scheduleJson: schedulePayload(withRun) as unknown as Prisma.InputJsonValue,
      stepsJson: withRun.steps as unknown as Prisma.InputJsonValue,
      name: withRun.note || "",
      enabled: withRun.enabled,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep(
  serverId: string,
  step: ScheduleStep,
): Promise<{ skipped?: boolean }> {
  const running = processManager.isRunning(serverId);

  if (step.kind === "wait") {
    await sleep((step.delaySeconds || 1) * 1000);
    return {};
  }

  if (step.kind === "backup") {
    const { createBackup } = await import("./backups.js");
    await createBackup({
      serverId,
      trigger: "scheduled",
      note: "Schedule chain",
      advanceBackupSchedule: false,
    });
    return {};
  }

  if (step.kind === "restart") {
    if (!running && step.onlyIfRunning !== false) {
      return { skipped: true };
    }
    if (running) {
      await processManager.stop(serverId);
    }
    const { startServerIfLicensed } = await import("./license.js");
    await startServerIfLicensed(serverId);
    return {};
  }

  // command
  if (!step.command) return { skipped: true };
  if (!running && step.onlyIfRunning !== false) {
    return { skipped: true };
  }
  if (running) {
    processManager.sendCommand(serverId, step.command);
  }
  return {};
}

export async function executeScheduledTask(
  serverId: string,
  task: ScheduledTask,
): Promise<{ ok: boolean; error?: string }> {
  const stepResults: { kind: string; skipped?: boolean; error?: string }[] = [];
  let fatal: string | null = null;

  for (let i = 0; i < task.steps.length; i++) {
    const step = task.steps[i];
    try {
      const result = await runStep(serverId, step);
      stepResults.push({ kind: step.kind, skipped: result.skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stepResults.push({ kind: step.kind, error: message });
      if (!step.continueOnFailure) {
        fatal = `Step ${i + 1} (${step.kind}): ${message}`;
        break;
      }
    }
  }

  await markTaskRun(serverId, task, fatal);
  logActivity({
    action: "schedule.run",
    actor: "scheduler",
    serverId,
    success: !fatal,
    metadata: {
      taskId: task.id,
      kind: task.kind,
      steps: stepResults,
      ...(fatal ? { error: fatal } : {}),
    },
  });

  return fatal ? { ok: false, error: fatal } : { ok: true };
}

export async function runScheduledTaskNow(
  serverId: string,
  taskId: string,
): Promise<ScheduledTask> {
  const tasks = await listScheduledTasks(serverId);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("Task not found");
  await executeScheduledTask(serverId, task);
  const updated = await listScheduledTasks(serverId);
  const next = updated.find((t) => t.id === taskId);
  if (!next) throw new Error("Task not found after run");
  return next;
}

export async function runDueScheduledTasks(
  serverIds: string[],
): Promise<{ serverId: string; taskId: string; kind: string }[]> {
  const done: { serverId: string; taskId: string; kind: string }[] = [];
  const now = Date.now();

  for (const serverId of serverIds) {
    const tasks = await listScheduledTasks(serverId);
    for (const task of tasks) {
      if (!task.enabled || !task.nextRunAt) continue;
      if (new Date(task.nextRunAt).getTime() > now) continue;

      try {
        await executeScheduledTask(serverId, task);
        done.push({ serverId, taskId: task.id, kind: task.kind });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.scheduledTask.updateMany({
          where: { id: task.id, serverId },
          data: {
            nextRunAt: new Date(now + 15 * 60_000),
            lastError: message,
          },
        });
        console.error(`[tasks] failed ${serverId}/${task.id}:`, err);
      }
    }
  }

  return done;
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
