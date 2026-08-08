import type { FastifyInstance } from "fastify";
import { BACKUP_TRANSFER_CHUNK_BYTES } from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import { requireServerAccess } from "../../auth/auth.js";
import {
  abortChunkedUpload,
  completeChunkedUpload,
  getChunkedUploadStatus,
  initChunkedUpload,
  saveUploadChunk,
} from "../../servers/backup-transfer.js";
import { initSchema } from "./backups-helpers.js";

/** Chunked backup upload routes. */
export function registerBackupUploadRoutes(app: FastifyInstance): void {
  /** Start a chunked backup upload session. */
  app.post<{
    Params: { id: string };
    Body: { fileName: string; sizeBytes: number; note?: string };
  }>("/api/servers/:id/backups/upload/init", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "backup.create",
    });
    if (!access) return;
    const server = access.server;

    const parsed = initSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const init = await initChunkedUpload({
        serverId: server.id,
        fileName: parsed.data.fileName,
        sizeBytes: parsed.data.sizeBytes,
        note: parsed.data.note,
      });
      return init;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string; uploadId: string } }>(
    "/api/servers/:id/backups/upload/:uploadId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.read",
      });
      if (!access) return;
      try {
        return await getChunkedUploadStatus(access.server.id, request.params.uploadId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({ error: message });
      }
    },
  );

  /** Upload one chunk (raw bytes, max 8 MiB). */
  app.put<{
    Params: { id: string; uploadId: string; index: string };
  }>(
    "/api/servers/:id/backups/upload/:uploadId/chunks/:index",
    { bodyLimit: BACKUP_TRANSFER_CHUNK_BYTES },
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.create",
      });
      if (!access) return;

      const body = request.body;
      if (!Buffer.isBuffer(body)) {
        return reply.status(400).send({ error: "Expected application/octet-stream body" });
      }

      try {
        const result = await saveUploadChunk({
          serverId: access.server.id,
          uploadId: request.params.uploadId,
          index: Number(request.params.index),
          data: body,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; uploadId: string } }>(
    "/api/servers/:id/backups/upload/:uploadId/complete",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.create",
      });
      if (!access) return;
      try {
        const backup = await completeChunkedUpload({
          serverId: access.server.id,
          uploadId: request.params.uploadId,
        });
        logActivity({
          action: "backup.upload",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            backupId: backup.id,
            file: backup.fileName,
            size: backup.sizeLabel,
          },
        });
        return { backup };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; uploadId: string } }>(
    "/api/servers/:id/backups/upload/:uploadId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.create",
      });
      if (!access) return;
      await abortChunkedUpload(access.server.id, request.params.uploadId);
      return { ok: true };
    },
  );
}
