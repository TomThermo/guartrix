import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../activity-log.js";
import { requireServerAccess } from "../auth/auth.js";
import {
  compressFiles,
  createDirectory,
  decompressFile,
  deletePath,
  downloadFile,
  downloadZip,
  listFiles,
  readFileContent,
  renamePath,
  saveUpload,
  writeFileContent,
} from "../files.js";

const compressSchema = z.object({
  paths: z.array(z.string().min(1).max(512)).min(1).max(100),
  destination: z.string().min(1).max(512),
});

const downloadZipSchema = z.object({
  paths: z.array(z.string().min(1).max(512)).min(1).max(100),
});

const decompressSchema = z.object({
  path: z.string().min(1).max(512),
  destination: z.string().min(1).max(512).optional(),
});

export function registerFileRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/servers/:id/files",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.read",
      });
      if (!access) return;
      try {
        return await listFiles(access.server.id, request.query.path ?? ".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/servers/:id/files/content",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: ["file.read-content", "file.download"],
      });
      if (!access) return;
      try {
        return await readFileContent(access.server.id, request.query.path ?? ".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/servers/:id/files/download",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.download",
      });
      if (!access) return;
      const rel = request.query.path ?? "";
      try {
        const upstream = await downloadFile(access.server.id, rel);
        const disposition =
          upstream.headers.get("content-disposition") ??
          `attachment; filename="download"`;
        const length = upstream.headers.get("content-length");
        logActivity({
          action: "file.download",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            path: rel,
            ...(length ? { bytes: Number(length) } : {}),
          },
        });
        reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Disposition", disposition);
        if (length) reply.header("Content-Length", length);
        return reply.send(upstream.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.put<{
    Params: { id: string };
    Body: { path?: string; content?: string };
  }>("/api/servers/:id/files/content", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "file.update",
    });
    if (!access) return;
    const rel = request.body?.path ?? ".";
    const content = request.body?.content ?? "";
    try {
      await writeFileContent(access.server.id, rel, content);
      logActivity({
        action: "file.write",
        request,
        user: access.user,
        server: access.server,
        metadata: { path: rel, bytes: Buffer.byteLength(content) },
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { path?: string };
  }>("/api/servers/:id/files/mkdir", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "file.create",
    });
    if (!access) return;
    try {
      const rel = request.body?.path ?? ".";
      await createDirectory(access.server.id, rel);
      logActivity({
        action: "file.create-directory",
        request,
        user: access.user,
        server: access.server,
        metadata: { path: rel },
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { from?: string; to?: string };
  }>("/api/servers/:id/files/rename", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "file.update",
    });
    if (!access) return;
    try {
      const from = request.body?.from ?? "";
      const to = request.body?.to ?? "";
      await renamePath(access.server.id, from, to);
      logActivity({
        action: "file.rename",
        request,
        user: access.user,
        server: access.server,
        metadata: { from, to },
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/files/compress",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.archive",
      });
      if (!access) return;
      const parsed = compressSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const result = await compressFiles(
          access.server.id,
          parsed.data.paths,
          parsed.data.destination,
        );
        logActivity({
          action: "file.compress",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            paths: parsed.data.paths,
            destination: result.path,
            bytes: result.size,
          },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/files/download-zip",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.archive",
      });
      if (!access) return;
      if (!access.permissions.includes("*") && !access.permissions.includes("file.download")) {
        return reply.status(403).send({ error: "Missing permission" });
      }
      const parsed = downloadZipSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const upstream = await downloadZip(
          access.server.id,
          parsed.data.paths,
        );
        logActivity({
          action: "file.compress",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            paths: parsed.data.paths,
            streamed: true,
          },
        });
        reply
          .header("Content-Type", "application/zip")
          .header(
            "Content-Disposition",
            'attachment; filename="download.zip"',
          );
        return reply.send(upstream.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/files/decompress",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.archive",
      });
      if (!access) return;
      const parsed = decompressSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const result = await decompressFile(
          access.server.id,
          parsed.data.path,
          parsed.data.destination,
        );
        logActivity({
          action: "file.decompress",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            path: parsed.data.path,
            destination: result.path,
          },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/servers/:id/files",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.delete",
      });
      if (!access) return;
      try {
        const rel = request.query.path ?? ".";
        await deletePath(access.server.id, rel);
        logActivity({
          action: "file.delete",
          request,
          user: access.user,
          server: access.server,
          metadata: { path: rel },
        });
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/servers/:id/files/upload",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "file.upload",
      });
      if (!access) return;
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "No file uploaded" });
      try {
        const dir = request.query.path ?? ".";
        await saveUpload(access.server.id, dir, file.filename, file.file);
        logActivity({
          action: "file.upload",
          request,
          user: access.user,
          server: access.server,
          metadata: { directory: dir, file: file.filename },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
