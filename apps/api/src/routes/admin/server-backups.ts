import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clampBackupKeepCount } from "@msm/shared";
import { requireAdmin } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { listBackups } from "../../servers/backups.js";
import {
  readBackupSchedule,
  writeBackupSchedule,
} from "../../servers/backup-schedule.js";

const keepCountSchema = z.object({
  keepCount: z.number().int().min(1).max(50),
});

export function registerAdminServerBackupRoutes(app: FastifyInstance): void {
  app.get("/api/admin/server-backups", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;

    const rows = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        owner: { select: { username: true } },
        backupSchedule: {
          select: { keepCount: true, mode: true },
        },
      },
    });

    const servers = await Promise.all(
      rows.map(async (row) => {
        const schedule = row.backupSchedule
          ? {
              keepCount: row.backupSchedule.keepCount,
              mode: row.backupSchedule.mode,
            }
          : await readBackupSchedule(row.id);
        let backupCount = 0;
        try {
          backupCount = (await listBackups(row.id)).length;
        } catch {
          backupCount = 0;
        }
        return {
          id: row.id,
          name: row.name,
          ownerUsername: row.owner?.username ?? "—",
          keepCount: schedule.keepCount,
          backupCount,
          scheduleMode: schedule.mode,
        };
      }),
    );

    return {
      defaultKeepCount: config.defaultBackupKeepCount,
      servers,
    };
  });

  app.put<{ Params: { serverId: string }; Body: unknown }>(
    "/api/admin/server-backups/:serverId",
    async (request, reply) => {
      const user = await requireAdmin(request, reply, "settings.write");
      if (!user) return;

      const parsed = keepCountSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const server = await prisma.server.findUnique({
        where: { id: request.params.serverId },
        select: { id: true, name: true },
      });
      if (!server) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const keepCount = clampBackupKeepCount(parsed.data.keepCount);
      const schedule = await writeBackupSchedule(server.id, { keepCount });

      logActivity({
        action: "admin.server-backup-retention",
        request,
        user,
        serverId: server.id,
        serverName: server.name,
        metadata: { keepCount: schedule.keepCount },
      });

      let backupCount = 0;
      try {
        backupCount = (await listBackups(server.id)).length;
      } catch {
        backupCount = 0;
      }

      return {
        server: {
          id: server.id,
          name: server.name,
          keepCount: schedule.keepCount,
          backupCount,
          scheduleMode: schedule.mode,
        },
      };
    },
  );
}
