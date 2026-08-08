import type { Prisma } from "@prisma/client";
import type { ScheduleStep, ScheduledTask } from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import { prisma } from "../../db.js";
import { processManager } from "../process-manager.js";
import { listScheduledTasks } from "./crud.js";
import { normalizeTask, parseIsoDate, rowToTask, schedulePayload } from "./parse.js";

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

async function runStep(serverId: string, step: ScheduleStep): Promise<{ skipped?: boolean }> {
  const running = processManager.isRunning(serverId);

  if (step.kind === "wait") {
    await sleep((step.delaySeconds || 1) * 1000);
    return {};
  }

  if (step.kind === "backup") {
    const { createBackup } = await import("../backups.js");
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
    const { startServerIfLicensed } = await import("../../license/license.js");
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

function taskDueBatchSize(): number {
  const raw = Number(process.env.SCHEDULER_TASK_BATCH ?? 50);
  if (!Number.isFinite(raw) || raw < 1) return 50;
  return Math.min(500, Math.floor(raw));
}

/** Run due scheduled tasks via indexed nextRunAt query (no per-server scan). */
export async function runDueScheduledTasks(
  _serverIds?: string[],
): Promise<{ serverId: string; taskId: string; kind: string }[]> {
  const done: { serverId: string; taskId: string; kind: string }[] = [];
  const now = Date.now();
  const dueRows = await prisma.scheduledTask.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: new Date(now) },
    },
    orderBy: { nextRunAt: "asc" },
    take: taskDueBatchSize(),
  });

  for (const row of dueRows) {
    const task = rowToTask(row);
    if (!task.enabled || !task.nextRunAt) continue;
    if (new Date(task.nextRunAt).getTime() > now) continue;

    try {
      await executeScheduledTask(row.serverId, task);
      done.push({ serverId: row.serverId, taskId: task.id, kind: task.kind });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.scheduledTask.updateMany({
        where: { id: task.id, serverId: row.serverId },
        data: {
          nextRunAt: new Date(now + 15 * 60_000),
          lastError: message,
        },
      });
      console.error(`[tasks] failed ${row.serverId}/${task.id}:`, err);
    }
  }

  return done;
}
