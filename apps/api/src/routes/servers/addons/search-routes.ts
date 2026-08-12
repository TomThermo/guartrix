import type { FastifyInstance } from "fastify";
import type { AddonSortIndex } from "@guartrix/shared";
import { addonKindFor } from "@guartrix/shared";
import { requireServerAccess } from "../../../auth/auth.js";
import {
  checkInstalledAddonUpdates,
  getAddonProjectDetails,
  listAddonCategories,
  listLoaderAddonVersions,
  listInstalledAddons,
  searchAddons,
} from "../../../servers/addons.js";
import { resolveLocalServerDataDir } from "../../../servers/server-data-path.js";

/** Browse / search / list addon routes. */
export function registerAddonSearchRoutes(app: FastifyInstance): void {
  app.get<{
    Params: { id: string };
    Querystring: {
      q?: string;
      category?: string;
      index?: string;
      offset?: string;
      limit?: string;
    };
  }>("/api/servers/:id/addons/search", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.read",
    });
    if (!access) return;
    const server = access.server;
    const allowedIndex = new Set(["relevance", "downloads", "follows", "newest", "updated"]);
    const index = (
      allowedIndex.has(request.query.index ?? "") ? request.query.index : "downloads"
    ) as AddonSortIndex;
    try {
      const result = await searchAddons(server.type, server.mcVersion, {
        query: request.query.q ?? "",
        category: request.query.category,
        index,
        offset: Number(request.query.offset ?? 0) || 0,
        limit: Number(request.query.limit ?? 24) || 24,
      });
      return {
        type: server.type,
        mcVersion: server.mcVersion,
        kind: addonKindFor(server.type),
        category: request.query.category?.trim() || null,
        index,
        ...result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const upstream = /Modrinth (timed out|unreachable|temporarily unavailable|rate limit)/i.test(
        message,
      );
      return reply.status(upstream ? 502 : 400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/addons/categories",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "addon.read",
      });
      if (!access) return;
      const server = access.server;
      try {
        const categories = await listAddonCategories(server.type);
        return {
          type: server.type,
          kind: addonKindFor(server.type),
          categories,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string; projectId: string } }>(
    "/api/servers/:id/addons/project/:projectId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "addon.read",
      });
      if (!access) return;
      try {
        const project = await getAddonProjectDetails(request.params.projectId);
        return { project };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string; projectId: string } }>(
    "/api/servers/:id/addons/:projectId/versions",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "addon.read",
      });
      if (!access) return;
      const server = access.server;
      try {
        const { versions, gameVersions } = await listLoaderAddonVersions(
          server.type,
          request.params.projectId,
        );
        return {
          serverMcVersion: server.mcVersion,
          mcVersion: server.mcVersion,
          gameVersions,
          versions,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/servers/:id/addons", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.read",
    });
    if (!access) return;
    const server = access.server;
    const installed = await listInstalledAddons(await resolveLocalServerDataDir(server.id));
    return {
      type: server.type,
      mcVersion: server.mcVersion,
      kind: addonKindFor(server.type),
      installed,
    };
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/addons/updates", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.read",
    });
    if (!access) return;
    const server = access.server;
    try {
      const updates = await checkInstalledAddonUpdates({
        serverDir: await resolveLocalServerDataDir(server.id),
        type: server.type,
        mcVersion: server.mcVersion,
      });
      return {
        updates,
        available: updates.filter((u) => u.available).length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
