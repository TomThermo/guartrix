import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import {
  compressFiles,
  createDirectory,
  deletePath,
  listFiles,
  readFileContent,
  renamePath,
  writeFileContent,
} from "../../servers/files.js";
import { requireApplicationServer } from "./server-access.js";

/** Application API file manager mirrors (`servers.files`). */
export function registerApplicationServerFilesRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/application/servers/:id/files",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
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
    "/api/application/servers/:id/files/content",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
      if (!access) return;
      try {
        return await readFileContent(access.server.id, request.query.path ?? ".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/files/content",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({
          path: z.string().min(1).max(512),
          content: z.string().max(2_000_000),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        await writeFileContent(
          access.server.id,
          parsed.data.path,
          parsed.data.content,
        );
        logActivity({
          action: "file.write",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: { path: parsed.data.path, via: "application-api" },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/files/mkdir",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({ path: z.string().min(1).max(512) })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        await createDirectory(access.server.id, parsed.data.path);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/files/rename",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({
          from: z.string().min(1).max(512),
          to: z.string().min(1).max(512),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        await renamePath(access.server.id, parsed.data.from, parsed.data.to);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/files/delete",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({ path: z.string().min(1).max(512) })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        await deletePath(access.server.id, parsed.data.path);
        logActivity({
          action: "file.delete",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: { path: parsed.data.path, via: "application-api" },
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/files/compress",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.files",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({
          paths: z.array(z.string().min(1).max(512)).min(1).max(100),
          destination: z.string().min(1).max(512),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        await compressFiles(
          access.server.id,
          parsed.data.paths,
          parsed.data.destination,
        );
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
