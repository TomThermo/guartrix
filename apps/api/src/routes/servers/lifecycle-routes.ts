import type { FastifyInstance } from "fastify";
import type { ServerType } from "@msm/shared";
import { requireServerAccess } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { errorMessage } from "../../http-error.js";
import { toMcServer } from "../../servers/serialize.js";
import {
  applyServerUpdate,
  checkServerUpdate,
} from "../../servers/updates.js";
import {
  applyVersionChangeViaRuntime,
  changeServerType,
  changeTypeRequiresWipeAddons,
  reinstallServer,
} from "../../servers/server-lifecycle.js";

const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
] as const;

/** Server update / reinstall / change-type routes. */
export function registerServerLifecycleRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/updates", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    try {
      return await checkServerUpdate(access.server);
    } catch (err) {
      const message = errorMessage(err);
      return reply.status(502).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { mcVersion?: string };
  }>("/api/servers/:id/update", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    try {
      const result = request.body?.mcVersion
        ? await applyVersionChangeViaRuntime(
            access.server.id,
            request.body.mcVersion,
          )
        : await applyServerUpdate(access.server.id, request.body?.mcVersion);
      logActivity({
        action: "server.version-change",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          from: access.server.mcVersion,
          to: result.server.mcVersion,
          type: result.server.type,
        },
      });
      return {
        server: toMcServer(result.server),
        update: result.update,
      };
    } catch (err) {
      const message = errorMessage(err);
      logActivity({
        action: "server.version-change",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, requested: request.body?.mcVersion },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { keepWorld?: boolean; keepAddons?: boolean };
  }>("/api/servers/:id/reinstall", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const keepWorld = request.body?.keepWorld !== false;
    const keepAddons = request.body?.keepAddons !== false;
    try {
      const server = await reinstallServer(access.server.id, { keepWorld, keepAddons });
      logActivity({
        action: "server.reinstall",
        request,
        user: access.user,
        server: access.server,
        metadata: { keepWorld, keepAddons },
      });
      return { server: toMcServer(server) };
    } catch (err) {
      const message = errorMessage(err);
      logActivity({
        action: "server.reinstall",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, keepWorld, keepAddons },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { type?: string; mcVersion?: string; wipeAddons?: boolean };
  }>("/api/servers/:id/change-type", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.update",
    });
    if (!access) return;
    const type = (request.body?.type ?? "").toUpperCase();
    const mcVersion = request.body?.mcVersion?.trim() ?? "";
    if (!(SERVER_TYPES as readonly string[]).includes(type)) {
      return reply.status(400).send({ error: "Invalid type" });
    }
    if (!mcVersion) {
      return reply.status(400).send({ error: "mcVersion is required" });
    }
    const wipeAddons =
      request.body?.wipeAddons === true ||
      changeTypeRequiresWipeAddons(
        access.server.type as ServerType,
        type as ServerType,
      );
    try {
      const server = await changeServerType(access.server.id, {
        type: type as ServerType,
        mcVersion,
        wipeAddons,
      });
      logActivity({
        action: "server.type-change",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          from: access.server.type,
          to: type,
          mcVersion,
          wipeAddons,
        },
      });
      return { server: toMcServer(server) };
    } catch (err) {
      const message = errorMessage(err);
      logActivity({
        action: "server.type-change",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, type, mcVersion },
      });
      return reply.status(400).send({ error: message });
    }
  });

}
