import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import type { ScheduledTask } from "@msm/shared";
import { serverDir } from "../../config.js";
import { prisma } from "../../db.js";
import {
  normalizeTask,
  parseIsoDate,
  rowToTask,
  schedulePayload,
  validateScheduleTiming,
  validateSteps,
} from "./parse.js";

function tasksJsonPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-scheduled-tasks.json");
}

const migratedServers = new Set<string>();

async function readJsonFileTasks(serverId: string): Promise<Partial<ScheduledTask>[] | null> {
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
export async function migrateScheduledTasksFromJson(serverId: string): Promise<number> {
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
  const result = await prisma.scheduledTask.deleteMany({
    where: { id: taskId, serverId },
  });
  if (result.count === 0) throw new Error("Task not found");
}
