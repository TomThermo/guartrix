import type { FastifyInstance } from "fastify";
import { logActivity } from "../../activity-log.js";
import { isAuthenticated, requireServerAccess } from "../../auth/auth.js";
import {
  deleteServerIcon,
  hasServerIcon,
  readServerIcon,
  saveServerIcon,
} from "../../servers/server-icon.js";

export function registerIconRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.includes("/icon")) return;
    if (!pathOnly.startsWith("/api/servers/")) return;
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/icon", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    const buf = await readServerIcon(access.server.id);
    return reply
      .header("Content-Type", "image/png")
      .header("Cache-Control", "no-cache")
      .send(buf);
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/icon/meta",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.read",
      });
      if (!access) return;
      return { hasIcon: hasServerIcon(access.server.id) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/icon",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.update",
      });
      if (!access) return;

      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "No image uploaded" });

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      try {
        const size = await saveServerIcon(access.server.id, buffer);
        logActivity({
          action: "settings.icon",
          request,
          user: access.user,
          server: access.server,
          metadata: { file: file.filename, action: "uploaded" },
        });
        return { ok: true, hasIcon: true, ...size };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/servers/:id/icon",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.update",
      });
      if (!access) return;
      try {
        await deleteServerIcon(access.server.id);
        logActivity({
          action: "settings.icon",
          request,
          user: access.user,
          server: access.server,
          metadata: { action: "removed" },
        });
        return { ok: true, hasIcon: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
