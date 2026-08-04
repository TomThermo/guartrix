import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../auth/auth.js";
import { logActivity } from "../activity-log.js";
import { importWorldZip, resetWorld } from "../servers/server-lifecycle.js";

/** World seed / reset / import routes (split from servers.ts). */
export function registerServerWorldRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string }; Querystring: { console?: string } }>(
    "/api/servers/:id/world/seed",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.read",
      });
      if (!access) return;
      const { getWorldSeedInfo } = await import("../servers/world-seed.js");
      const wantConsole =
        request.query?.console === "1" || request.query?.console === "true";
      try {
        return await getWorldSeedInfo({
          serverId: access.server.id,
          mcVersion: access.server.mcVersion,
          queryConsole: wantConsole,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/world/seed/query",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "control.console",
      });
      if (!access) return;
      const { getWorldSeedInfo } = await import("../servers/world-seed.js");
      try {
        const info = await getWorldSeedInfo({
          serverId: access.server.id,
          mcVersion: access.server.mcVersion,
          queryConsole: true,
        });
        if (!info.seed) {
          return reply.status(409).send({
            error: info.consoleAvailable
              ? "No seed in console output — is the server fully started?"
              : "Server must be running to query seed via /seed",
            ...info,
          });
        }
        logActivity({
          action: "server.world-seed",
          request,
          user: access.user,
          server: access.server,
          metadata: { seed: info.seed, source: info.source },
        });
        return info;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      dimensions?: Array<"overworld" | "nether" | "end">;
      regenerate?: boolean;
    };
  }>("/api/servers/:id/world/reset", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    try {
      const result = await resetWorld(access.server.id, {
        dimensions: request.body?.dimensions,
        regenerate: request.body?.regenerate !== false,
      });
      logActivity({
        action: "server.world-reset",
        request,
        user: access.user,
        server: access.server,
        metadata: result,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.world-reset",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/world/import",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.update",
      });
      if (!access) return;
      try {
        const file = await request.file();
        if (!file) {
          return reply.status(400).send({ error: "World zip file is required" });
        }
        const chunks: Buffer[] = [];
        for await (const chunk of file.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const result = await importWorldZip(access.server.id, {
          buffer,
          fileName: file.filename,
        });
        logActivity({
          action: "server.world-import",
          request,
          user: access.user,
          server: access.server,
          metadata: { ...result, file: file.filename },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity({
          action: "server.world-import",
          request,
          user: access.user,
          server: access.server,
          success: false,
          metadata: { error: message },
        });
        return reply.status(400).send({ error: message });
      }
    },
  );
}
