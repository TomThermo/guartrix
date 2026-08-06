import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
} from "../../servers/backups.js";
import { requireApplicationServer } from "./server-access.js";

/** Application API backup mirrors (`servers.backups`). */
export function registerApplicationServerBackupsRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/application/servers/:id/backups",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.backups",
        request.params.id,
      );
      if (!access) return;
      return { backups: await listBackups(access.server.id) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/backups",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.backups",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({ note: z.string().max(200).nullable().optional() })
        .safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const backup = await createBackup({
          serverId: access.server.id,
          note: parsed.data.note,
          trigger: "manual",
        });
        logActivity({
          action: "backup.create",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: { backupId: backup.id, via: "application-api" },
        });
        return reply.status(201).send({ backup });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; backupId: string } }>(
    "/api/application/servers/:id/backups/:backupId/restore",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.backups",
        request.params.id,
      );
      if (!access) return;
      try {
        await restoreBackup({
          serverId: access.server.id,
          backupId: request.params.backupId,
        });
        logActivity({
          action: "backup.restore",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: {
            backupId: request.params.backupId,
            via: "application-api",
          },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; backupId: string } }>(
    "/api/application/servers/:id/backups/:backupId",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.backups",
        request.params.id,
      );
      if (!access) return;
      try {
        await deleteBackup(access.server.id, request.params.backupId);
        logActivity({
          action: "backup.delete",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: {
            backupId: request.params.backupId,
            via: "application-api",
          },
        });
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
