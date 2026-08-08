import fs from "node:fs";
import fsp from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { BACKUP_TRANSFER_CHUNK_BYTES, BACKUP_UPLOAD_MAX_BYTES } from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import { requireServerAccess } from "../../auth/auth.js";
import {
  assertBackupExists,
  createBackup,
  deleteBackup,
  isBackupBusy,
  listBackups,
  readBackupSchedule,
  restoreBackup,
} from "../../servers/backups.js";
import { prisma } from "../../db.js";
import { parseRange } from "./backups-helpers.js";

/** List / create / download / delete / restore backup routes. */
export function registerBackupCrudRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/backups", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "backup.read",
    });
    if (!access) return;
    const server = access.server;

    const [backups, schedule] = await Promise.all([
      listBackups(server.id),
      readBackupSchedule(server.id),
    ]);
    const { isBackupEncryptionEnabled } = await import("../../servers/backup-crypto.js");
    return {
      backups,
      schedule,
      busy: await isBackupBusy(server.id),
      encryptionEnabled: isBackupEncryptionEnabled(),
      limits: {
        maxUploadBytes: BACKUP_UPLOAD_MAX_BYTES,
        chunkBytes: BACKUP_TRANSFER_CHUNK_BYTES,
      },
    };
  });

  app.post<{
    Params: { id: string };
    Body: { note?: string };
  }>("/api/servers/:id/backups", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "backup.create",
    });
    if (!access) return;
    const server = access.server;
    try {
      const backup = await createBackup({
        serverId: server.id,
        note: request.body?.note,
        trigger: "manual",
      });
      const schedule = await readBackupSchedule(server.id);
      logActivity({
        action: "backup.create",
        request,
        user: access.user,
        server,
        metadata: {
          backupId: backup.id,
          size: backup.sizeLabel,
          note: backup.note,
        },
      });
      return { backup, schedule, busy: await isBackupBusy(server.id) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "backup.failed",
        request,
        user: access.user,
        server,
        success: false,
        metadata: { error: message, trigger: "manual" },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string; backupId: string } }>(
    "/api/servers/:id/backups/:backupId/download",
    { exposeHeadRoute: false },
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.read",
      });
      if (!access) return;
      const server = access.server;
      try {
        const file = await assertBackupExists(server.id, request.params.backupId);
        const st = await fsp.stat(file);
        const enc = file.endsWith(".tar.gz.enc");
        const fileName = `${server.name.replace(/[^\w.\- ]+/g, "_")}-${request.params.backupId}${enc ? ".tar.gz.enc" : ".tar.gz"}`;
        reply.header("Content-Type", enc ? "application/octet-stream" : "application/gzip");
        reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
        reply.header("Accept-Ranges", "bytes");

        const range = parseRange(request.headers.range, st.size);
        // Log once per full download; for Range requests only the first chunk.
        if (!range || range.start === 0) {
          logActivity({
            action: "backup.download",
            request,
            user: access.user,
            server,
            metadata: {
              backupId: request.params.backupId,
              bytes: st.size,
              range: Boolean(range),
            },
          });
        }
        if (range) {
          const { start, end } = range;
          const chunkSize = end - start + 1;
          reply.code(206);
          reply.header("Content-Range", `bytes ${start}-${end}/${st.size}`);
          reply.header("Content-Length", String(chunkSize));
          return reply.send(fs.createReadStream(file, { start, end }));
        }

        reply.header("Content-Length", String(st.size));
        return reply.send(fs.createReadStream(file));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({ error: message });
      }
    },
  );

  app.head<{ Params: { id: string; backupId: string } }>(
    "/api/servers/:id/backups/:backupId/download",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.read",
      });
      if (!access) return;
      try {
        const file = await assertBackupExists(access.server.id, request.params.backupId);
        const st = await fsp.stat(file);
        reply.header("Accept-Ranges", "bytes");
        reply.header("Content-Length", String(st.size));
        reply.header("Content-Type", "application/gzip");
        return reply.code(200).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; backupId: string } }>(
    "/api/servers/:id/backups/:backupId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.delete",
      });
      if (!access) return;
      try {
        await deleteBackup(access.server.id, request.params.backupId);
        logActivity({
          action: "backup.delete",
          request,
          user: access.user,
          server: access.server,
          metadata: { backupId: request.params.backupId },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{
    Params: { id: string; backupId: string };
    Body: { startAfter?: boolean };
  }>("/api/servers/:id/backups/:backupId/restore", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "backup.restore",
    });
    if (!access) return;
    const server = access.server;
    try {
      await restoreBackup({
        serverId: server.id,
        backupId: request.params.backupId,
      });
      if (request.body?.startAfter) {
        const { openFirewallPort } = await import("../../nodes/firewall.js");
        const { primaryAllocationProtocol } = await import("@msm/shared");
        const { startServerIfLicensed } = await import("../../license/license.js");
        await openFirewallPort(server.port, server.nodeId, primaryAllocationProtocol(server.type));
        await startServerIfLicensed(server.id);
      }
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
        include: (await import("../../servers/serialize.js")).serverListInclude,
      });
      const { toMcServer } = await import("../../servers/serialize.js");
      logActivity({
        action: "backup.restore",
        request,
        user: access.user,
        server,
        metadata: {
          backupId: request.params.backupId,
          startedAfter: Boolean(request.body?.startAfter),
        },
      });
      return { ok: true, server: toMcServer(updated) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "backup.restore",
        request,
        user: access.user,
        server,
        success: false,
        metadata: { backupId: request.params.backupId, error: message },
      });
      return reply.status(400).send({ error: message });
    }
  });
}
