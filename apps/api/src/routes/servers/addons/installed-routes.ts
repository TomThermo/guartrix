import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../../../auth/auth.js";
import { logActivity } from "../../../activity-log.js";
import { installAddon, syncInstalledAddons, uninstallAddon } from "../../../servers/addons.js";
import { serverDir } from "../../../config.js";
import { fixDataOwnership } from "../../../servers/process-manager.js";
import { invalidateAddonUpdateCache } from "../dashboard.js";

/** Install / sync / uninstall addon routes. */
export function registerAddonInstalledRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>("/api/servers/:id/addons/sync", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.update",
    });
    if (!access) return;
    const server = access.server;
    try {
      await fixDataOwnership(serverDir(server.id));
      const result = await syncInstalledAddons(serverDir(server.id), server.type);
      invalidateAddonUpdateCache(server.id);
      logActivity({
        action: "addon.sync",
        request,
        user: access.user,
        server,
        metadata: {
          folder: result.folder,
          jarCount: result.jarCount,
          added: result.added.map((a) => a.fileName),
          removed: result.removed.map((a) => a.fileName),
          duplicates: result.duplicates,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { projectId?: string; versionId?: string };
  }>("/api/servers/:id/addons/install", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.update",
    });
    if (!access) return;
    const server = access.server;
    const projectId = request.body?.projectId?.trim();
    if (!projectId) return reply.status(400).send({ error: "projectId is required" });
    try {
      await fixDataOwnership(serverDir(server.id));

      const result = await installAddon({
        serverDir: serverDir(server.id),
        type: server.type,
        mcVersion: server.mcVersion,
        projectId,
        versionId: request.body?.versionId,
      });
      invalidateAddonUpdateCache(server.id);
      logActivity({
        action: "addon.install",
        request,
        user: access.user,
        server,
        metadata: {
          addon: result.installed.title,
          version: result.installed.versionNumber,
          file: result.installed.fileName,
          dependencies: result.dependenciesInstalled.map((d) => d.title),
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string; projectId: string } }>(
    "/api/servers/:id/addons/:projectId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "addon.update",
      });
      if (!access) return;
      const server = access.server;
      try {
        await uninstallAddon(serverDir(server.id), server.type, request.params.projectId);
        invalidateAddonUpdateCache(server.id);
        logActivity({
          action: "addon.delete",
          request,
          user: access.user,
          server,
          metadata: { projectId: request.params.projectId },
        });
        return { ok: true, restartRequired: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );
}
