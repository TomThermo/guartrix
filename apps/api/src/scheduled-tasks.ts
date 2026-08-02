import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ScheduleStep, ScheduledTask } from "@msm/shared";
import { logActivity } from "./activity-log.js";
import { serverDir } from "./config.js";
import { processManager } from "./process-manager.js";
import {
  computeDailyNextRun,
  computeIntervalNextRun,
  computeWeeklyNextRun,
  parseDailyAt,
} from "./schedule-time.js";

function tasksPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-scheduled-tasks.json");
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

export async function listScheduledTasks(serverId: string): Promise<ScheduledTask[]> {
  try {
    const raw = await fs.readFile(tasksPath(serverId), "utf8");
    const data = JSON.parse(raw) as { tasks?: Partial<ScheduledTask>[] };
    const tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
    return tasks.sort((a, b) => (a.nextRunAt || "").localeCompare(b.nextRunAt || ""));
  } catch {
    return [];
  }
}

async function writeTasks(serverId: string, tasks: ScheduledTask[]): Promise<void> {
  await fs.mkdir(serverDir(serverId), { recursive: true });
  await fs.writeFile(
    tasksPath(serverId),
    JSON.stringify({ tasks }, null, 2) + "\n",
    "utf8",
  );
}

export async function createScheduledTask(
  serverId: string,
  input: Partial<ScheduledTask>,
): Promise<ScheduledTask> {
  const task = normalizeTask({ ...input, enabled: input.enabled ?? true });
  validateSteps(task.steps);
  validateScheduleTiming(task);
  const tasks = await listScheduledTasks(serverId);
  tasks.push(task);
  await writeTasks(serverId, tasks);
  return task;
}

export async function updateScheduledTask(
  serverId: string,
  taskId: string,
  patch: Partial<ScheduledTask>,
): Promise<ScheduledTask> {
  const tasks = await listScheduledTasks(serverId);
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error("Task not found");
  const next = normalizeTask({ ...tasks[idx], ...patch, id: taskId });
  validateSteps(next.steps);
  validateScheduleTiming(next);
  tasks[idx] = next;
  await writeTasks(serverId, tasks);
  return next;
}

export async function deleteScheduledTask(serverId: string, taskId: string): Promise<void> {
  const tasks = await listScheduledTasks(serverId);
  const next = tasks.filter((t) => t.id !== taskId);
  if (next.length === tasks.length) throw new Error("Task not found");
  await writeTasks(serverId, next);
}

async function markTaskRun(
  serverId: string,
  task: ScheduledTask,
  lastError: string | null,
): Promise<void> {
  const tasks = await listScheduledTasks(serverId);
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  tasks[idx] = normalizeTask({
    ...tasks[idx],
    lastRunAt: now,
    lastError,
  });
  await writeTasks(serverId, tasks);
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
        const tasks2 = await listScheduledTasks(serverId);
        const idx = tasks2.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          tasks2[idx] = {
            ...tasks2[idx],
            nextRunAt: new Date(now + 15 * 60_000).toISOString(),
            lastError: err instanceof Error ? err.message : String(err),
          };
          await writeTasks(serverId, tasks2);
        }
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
