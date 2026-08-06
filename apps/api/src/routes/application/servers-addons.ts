import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addonKindFor } from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import { serverDir } from "../../config.js";
import {
  installAddon,
  listInstalledAddons,
  uninstallAddon,
} from "../../servers/addons.js";
import { fixDataOwnership } from "../../servers/process-manager.js";
import { requireApplicationServer } from "./server-access.js";

/** Application API addon mirrors (`servers.addons`). */
export function registerApplicationServerAddonsRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/application/servers/:id/addons",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.addons",
        request.params.id,
      );
      if (!access) return;
      const server = access.server;
      const installed = await listInstalledAddons(serverDir(server.id));
      return {
        type: server.type,
        mcVersion: server.mcVersion,
        kind: addonKindFor(server.type),
        installed,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/application/servers/:id/addons/install",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.addons",
        request.params.id,
      );
      if (!access) return;
      const parsed = z
        .object({
          projectId: z.string().trim().min(1),
          versionId: z.string().trim().min(1).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const server = access.server;
      try {
        await fixDataOwnership(serverDir(server.id));
        const result = await installAddon({
          serverDir: serverDir(server.id),
          type: server.type,
          mcVersion: server.mcVersion,
          projectId: parsed.data.projectId,
          versionId: parsed.data.versionId,
        });
        logActivity({
          action: "addon.install",
          actor: `app:${access.ctx.prefix}`,
          server,
          metadata: {
            addon: result.installed.title,
            version: result.installed.versionNumber,
            via: "application-api",
          },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; projectId: string } }>(
    "/api/application/servers/:id/addons/:projectId",
    async (request, reply) => {
      const access = await requireApplicationServer(
        request,
        reply,
        "servers.addons",
        request.params.id,
      );
      if (!access) return;
      try {
        await uninstallAddon(
          serverDir(access.server.id),
          access.server.type,
          request.params.projectId,
        );
        logActivity({
          action: "addon.delete",
          actor: `app:${access.ctx.prefix}`,
          server: access.server,
          metadata: {
            projectId: request.params.projectId,
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
