import type { FastifyInstance } from "fastify";
import { logActivity } from "../../activity-log.js";
import { requireServerAccess } from "../../auth/auth.js";
import { writeBackupSchedule } from "../../servers/backups.js";
import { scheduleSchema } from "./backups-helpers.js";

/** Backup schedule routes. */
export function registerBackupScheduleRoutes(app: FastifyInstance): void {
  app.put<{
    Params: { id: string };
    Body: unknown;
  }>("/api/servers/:id/backups/schedule", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "backup.create",
    });
    if (!access) return;
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const schedule = await writeBackupSchedule(access.server.id, parsed.data);
      logActivity({
        action: "backup.schedule",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          mode: schedule.mode,
          intervalHours: schedule.intervalHours,
          dailyAt: schedule.dailyAt,
          keepCount: schedule.keepCount,
        },
      });
      return { schedule };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
