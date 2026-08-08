import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import { requireServerAccess } from "../../auth/auth.js";
import {
  createScheduledTask,
  deleteScheduledTask,
  describeScheduleSteps,
  listScheduledTasks,
  runScheduledTaskNow,
  updateScheduledTask,
} from "../../servers/scheduled-tasks.js";

const stepSchema = z.object({
  kind: z.enum(["command", "restart", "backup", "wait"]),
  command: z.string().max(200).optional(),
  delaySeconds: z.number().int().min(1).max(3600).optional(),
  onlyIfRunning: z.boolean().optional(),
  continueOnFailure: z.boolean().optional(),
});

const taskSchema = z.object({
  enabled: z.boolean().optional(),
  kind: z.enum(["command", "restart", "backup", "chain"]).optional(),
  mode: z.enum(["daily", "interval", "weekly", "cron"]),
  dailyAt: z.string().optional(),
  intervalHours: z.number().int().min(1).max(168).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  cronExpression: z.string().max(120).optional(),
  command: z.string().max(200).optional(),
  note: z.string().max(120).nullable().optional(),
  steps: z.array(stepSchema).min(1).max(20).optional(),
});

export function registerTaskRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/tasks", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "schedule.read",
    });
    if (!access) return;
    return { tasks: await listScheduledTasks(access.server.id) };
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/tasks",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "schedule.create",
      });
      if (!access) return;
      const parsed = taskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const task = await createScheduledTask(access.server.id, parsed.data);
        logActivity({
          action: "schedule.create",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            taskId: task.id,
            kind: task.kind,
            mode: task.mode,
            steps: describeScheduleSteps(task.steps),
          },
        });
        return reply.status(201).send({ task });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.patch<{ Params: { id: string; taskId: string }; Body: unknown }>(
    "/api/servers/:id/tasks/:taskId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "schedule.update",
      });
      if (!access) return;
      const parsed = taskSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const task = await updateScheduledTask(
          access.server.id,
          request.params.taskId,
          parsed.data,
        );
        logActivity({
          action: "schedule.update",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            taskId: task.id,
            kind: task.kind,
            enabled: task.enabled,
            fields: Object.keys(parsed.data),
          },
        });
        return { task };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; taskId: string } }>(
    "/api/servers/:id/tasks/:taskId/run",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "schedule.update",
      });
      if (!access) return;
      try {
        const task = await runScheduledTaskNow(access.server.id, request.params.taskId);
        logActivity({
          action: "schedule.run",
          request,
          user: access.user,
          server: access.server,
          success: !task.lastError,
          metadata: {
            taskId: task.id,
            kind: task.kind,
            manual: true,
            ...(task.lastError ? { error: task.lastError } : {}),
          },
        });
        return { task };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; taskId: string } }>(
    "/api/servers/:id/tasks/:taskId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "schedule.delete",
      });
      if (!access) return;
      try {
        await deleteScheduledTask(access.server.id, request.params.taskId);
        logActivity({
          action: "schedule.delete",
          request,
          user: access.user,
          server: access.server,
          metadata: { taskId: request.params.taskId },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
