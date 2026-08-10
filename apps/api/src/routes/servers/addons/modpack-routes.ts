import type { FastifyInstance } from "fastify";
import type { ServerType } from "@guartrix/shared";
import { requireServerAccess } from "../../../auth/auth.js";
import { logActivity } from "../../../activity-log.js";

/** Modpack search/install and Geyser bundle routes. */
export function registerAddonModpackRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/modpacks/categories",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "addon.read",
      });
      if (!access) return;
      try {
        const { listModpackCategories } = await import("../../../servers/modpacks.js");
        const categories = await listModpackCategories();
        return { categories };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: {
      q?: string;
      source?: string;
      category?: string;
      index?: string;
      offset?: string;
      limit?: string;
    };
  }>("/api/servers/:id/modpacks/search", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.read",
    });
    if (!access) return;
    const source = (request.query.source ?? "modrinth").toLowerCase();
    try {
      const { searchModrinthModpacks, searchCurseforgeModpacks } = await import(
        "../../../servers/modpacks.js"
      );
      if (source === "curseforge") {
        return await searchCurseforgeModpacks({
          type: access.server.type as ServerType,
          mcVersion: access.server.mcVersion,
          query: request.query.q,
          offset: Number(request.query.offset ?? 0) || 0,
          limit: Number(request.query.limit ?? 24) || 24,
        });
      }
      const result = await searchModrinthModpacks({
        type: access.server.type as ServerType,
        mcVersion: access.server.mcVersion,
        query: request.query.q,
        category: request.query.category,
        index: request.query.index,
        offset: Number(request.query.offset ?? 0) || 0,
        limit: Number(request.query.limit ?? 24) || 24,
      });
      return {
        ...result,
        category: request.query.category?.trim() || null,
        configured: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: {
      source?: string;
      projectId?: string;
      versionId?: string;
      modId?: number;
      fileId?: number;
    };
  }>("/api/servers/:id/modpacks/install", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.update",
    });
    if (!access) return;
    const source = (request.body?.source ?? "modrinth").toLowerCase();
    try {
      const { installModrinthModpack, installCurseforgeModpack } = await import(
        "../../../servers/modpacks.js"
      );
      let result: { title: string; versionNumber: string; filesInstalled: number };
      if (source === "curseforge") {
        const modId = Number(request.body?.modId);
        if (!Number.isFinite(modId)) {
          return reply.status(400).send({ error: "modId is required" });
        }
        result = await installCurseforgeModpack({
          serverId: access.server.id,
          modId,
          fileId: request.body?.fileId,
        });
      } else {
        const projectId = request.body?.projectId?.trim();
        if (!projectId) {
          return reply.status(400).send({ error: "projectId is required" });
        }
        result = await installModrinthModpack({
          serverId: access.server.id,
          projectId,
          versionId: request.body?.versionId,
        });
      }
      logActivity({
        action: "addon.modpack",
        request,
        user: access.user,
        server: access.server,
        metadata: { source, ...result },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "addon.modpack",
        request,
        user: access.user,
        server: access.server,
        success: false,
        metadata: { error: message, source },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { withFloodgate?: boolean };
  }>("/api/servers/:id/geyser", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.update",
    });
    if (!access) return;
    try {
      const { installGeyserBundle } = await import("../../../servers/geyser.js");
      const result = await installGeyserBundle({
        serverId: access.server.id,
        withFloodgate: request.body?.withFloodgate !== false,
      });
      logActivity({
        action: "addon.geyser",
        request,
        user: access.user,
        server: access.server,
        metadata: result,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
