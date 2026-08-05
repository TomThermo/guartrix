import fs from "node:fs";
import fsp from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BACKUP_TRANSFER_CHUNK_BYTES,
  BACKUP_UPLOAD_MAX_BYTES,
} from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { isAuthenticated, requireServerAccess } from "../auth/auth.js";
import {
  abortChunkedUpload,
  completeChunkedUpload,
  getChunkedUploadStatus,
  initChunkedUpload,
  saveUploadChunk,
} from "../servers/backup-transfer.js";
import {
  assertBackupExists,
  createBackup,
  deleteBackup,
  isBackupBusy,
  listBackups,
  readBackupSchedule,
  restoreBackup,
  writeBackupSchedule,
} from "../servers/backups.js";
import { prisma } from "../db.js";

const scheduleSchema = z.object({
  mode: z.enum(["off", "interval", "daily"]),
  intervalHours: z.number().int().min(1).max(168).optional(),
  dailyAt: z.string().optional(),
  keepCount: z.number().int().min(1).max(50).optional(),
});

const initSchema = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(BACKUP_UPLOAD_MAX_BYTES),
  note: z.string().max(120).optional(),
});

function parseRange(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) return null;
  let start = m[1] === "" ? NaN : Number(m[1]);
  let end = m[2] === "" ? NaN : Number(m[2]);
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function isChunkUpload(request: { method: string; url: string }): boolean {
  if (request.method !== "PUT") return false;
  const pathOnly = request.url.split("?")[0];
  return /\/api\/servers\/[^/]+\/backups\/upload\/[^/]+\/chunks\/\d+$/.test(
    pathOnly,
  );
}

export function registerBackupRoutes(app: FastifyInstance): void {
  // Chunk bodies are small (≤8 MiB) — buffer them; no giant streaming uploads.
  app.addContentTypeParser(
    "application/octet-stream",
    {
      parseAs: "buffer",
      bodyLimit: BACKUP_TRANSFER_CHUNK_BYTES,
    },
    (request, body, done) => {
      if (!isChunkUpload(request)) {
        done(null, body);
        return;
      }
      done(null, body);
    },
  );

  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.includes("/backups")) return;
    if (!pathOnly.startsWith("/api/servers/")) return;
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/backups",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "backup.read",
      });
      if (!access) return;
      const server = access.server;

      const [backups, schedule] = await Promise.all([
        listBackups(server.id),
        readBackupSchedule(server.id),
      ]);
      const { isBackupEncryptionEnabled } = await import("../servers/backup-crypto.js");
      return {
        backups,
        schedule,
        busy: isBackupBusy(server.id),
        encryptionEnabled: isBackupEncryptionEnabled(),
        limits: {
          maxUploadBytes: BACKUP_UPLOAD_MAX_BYTES,
          chunkBytes: BACKUP_TRANSFER_CHUNK_BYTES,
        },
      };
    },
  );

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
      return { backup, schedule, busy: isBackupBusy(server.id) };
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
        return reply
          .status(400)
          .send({ error: "Expected application/octet-stream body" });
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
        const file = await assertBackupExists(
          server.id,
          request.params.backupId,
        );
        const st = await fsp.stat(file);
        const enc = file.endsWith(".tar.gz.enc");
        const fileName = `${server.name.replace(/[^\w.\- ]+/g, "_")}-${request.params.backupId}${enc ? ".tar.gz.enc" : ".tar.gz"}`;
        reply.header(
          "Content-Type",
          enc ? "application/octet-stream" : "application/gzip",
        );
        reply.header(
          "Content-Disposition",
          `attachment; filename="${fileName}"`,
        );
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
        const file = await assertBackupExists(
          access.server.id,
          request.params.backupId,
        );
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
        const { openFirewallPort } = await import("../nodes/firewall.js");
        const { primaryAllocationProtocol } = await import("@msm/shared");
        const { startServerIfLicensed } = await import("../license/license.js");
        await openFirewallPort(
          server.port,
          server.nodeId,
          primaryAllocationProtocol(server.type),
        );
        await startServerIfLicensed(server.id);
      }
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
        include: (await import("../servers/serialize.js")).serverListInclude,
      });
      const { toMcServer } = await import("../servers/serialize.js");
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
