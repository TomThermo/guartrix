import type { FastifyInstance } from "fastify";
import { isAuthenticated, requireServerAccess } from "../../auth/auth.js";
import { listLogFiles, readLogFile } from "../../servers/logs.js";

export function registerLogRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.includes("/logs")) return;
    if (!pathOnly.startsWith("/api/servers/")) return;
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/logs",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "audit.read",
      });
      if (!access) return;
      return { files: await listLogFiles(access.server.id) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/servers/:id/logs/content",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "audit.read",
      });
      if (!access) return;
      const rel = request.query.path;
      if (!rel) return reply.status(400).send({ error: "path is required" });
      try {
        return await readLogFile(access.server.id, rel);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
