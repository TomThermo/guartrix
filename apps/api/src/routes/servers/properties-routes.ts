import type { FastifyInstance } from "fastify";
import type { ServerType } from "@msm/shared";
import { requireServerAccess } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { errorMessage } from "../../http-error.js";

/** Engine settings, console favorites, proxy mode. */
export function registerServerPropertiesRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/engine", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    const { getEngineSettings } = await import("../../servers/engine-config.js");
    return getEngineSettings(access.server.id, access.server.type as ServerType);
  });

  app.patch<{
    Params: { id: string };
    Body: { updates?: Record<string, boolean | number | string> };
  }>("/api/servers/:id/engine", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const updates = request.body?.updates ?? {};
    try {
      const { updateEngineSettings } = await import("../../servers/engine-config.js");
      const result = await updateEngineSettings(
        access.server.id,
        access.server.type as ServerType,
        updates,
      );
      logActivity({
        action: "settings.engine",
        request,
        user: access.user,
        server: access.server,
        metadata: { keys: Object.keys(updates) },
      });
      return result;
    } catch (err) {
      const message = errorMessage(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/console-favorites",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "control.console",
      });
      if (!access) return;
      const { getConsoleFavorites } = await import("../../servers/console-favorites.js");
      return { commands: await getConsoleFavorites(access.server.id) };
    },
  );

  app.put<{ Params: { id: string }; Body: { commands?: string[] } }>(
    "/api/servers/:id/console-favorites",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "control.console",
      });
      if (!access) return;
      const commands = Array.isArray(request.body?.commands) ? request.body!.commands! : [];
      const { setConsoleFavorites } = await import("../../servers/console-favorites.js");
      return { commands: await setConsoleFavorites(access.server.id, commands) };
    },
  );

  app.get<{ Params: { id: string } }>("/api/servers/:id/proxy", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    const { getProxySetup } = await import("../../servers/proxy-setup.js");
    return getProxySetup(access.server.id, access.server.type as ServerType);
  });

  app.post<{
    Params: { id: string };
    Body: { mode?: "none" | "velocity" | "bungeecord" };
  }>("/api/servers/:id/proxy", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const mode = request.body?.mode ?? "none";
    if (!["none", "velocity", "bungeecord"].includes(mode)) {
      return reply.status(400).send({ error: "Invalid proxy mode" });
    }
    try {
      const { applyProxySetup } = await import("../../servers/proxy-setup.js");
      const result = await applyProxySetup(
        access.server.id,
        access.server.type as ServerType,
        mode,
      );
      logActivity({
        action: "settings.engine",
        request,
        user: access.user,
        server: access.server,
        metadata: { proxyMode: mode },
      });
      return result;
    } catch (err) {
      const message = errorMessage(err);
      return reply.status(400).send({ error: message });
    }
  });
}
