import type { FastifyInstance } from "fastify";
import type { AddonSortIndex, ServerType } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import { requireServerAccess } from "../auth.js";
import { logActivity } from "../activity-log.js";
import {
  checkInstalledAddonUpdates,
  getAddonProjectDetails,
  installAddon,
  listAddonCategories,
  listLoaderAddonVersions,
  listInstalledAddons,
  searchAddons,
  syncInstalledAddons,
  uninstallAddon,
} from "../addons.js";
import { serverDir } from "../config.js";
import { fixDataOwnership } from "../process-manager.js";
import { invalidateAddonUpdateCache } from "./servers-dashboard.js";

/** Addon / modpack / geyser routes (split from servers.ts). */
export function registerServerAddonRoutes(app: FastifyInstance): void {
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
    const allowedIndex = new Set([
      "relevance",
      "downloads",
      "follows",
      "newest",
      "updated",
    ]);
    const index = (
      allowedIndex.has(request.query.index ?? "")
        ? request.query.index
        : "downloads"
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
      const upstream =
        /Modrinth (timed out|unreachable|temporarily unavailable|rate limit)/i.test(
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
    const installed = await listInstalledAddons(serverDir(server.id));
    return {
      type: server.type,
      mcVersion: server.mcVersion,
      kind: addonKindFor(server.type),
      installed,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/addons/updates",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "addon.read",
      });
      if (!access) return;
      const server = access.server;
      try {
        const updates = await checkInstalledAddonUpdates({
          serverDir: serverDir(server.id),
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
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/addons/sync",
    async (request, reply) => {
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
    },
  );

  app.post<{
    Params: { id: string };
    Body: { stackId?: string };
  }>("/api/servers/:id/addon-stacks", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.update",
    });
    if (!access) return;
    const { RECOMMENDED_PLUGIN_STACKS, addonKindFor } = await import("@msm/shared");
    if (addonKindFor(access.server.type as ServerType) !== "plugin") {
      return reply
        .status(400)
        .send({ error: "Recommended stacks are only for Paper/Purpur" });
    }
    const stack = RECOMMENDED_PLUGIN_STACKS.find(
      (s) => s.id === request.body?.stackId,
    );
    if (!stack) return reply.status(404).send({ error: "Unknown stack" });

    const installed: string[] = [];
    const errors: Array<{ name: string; error: string }> = [];
    const dir = serverDir(access.server.id);
    await fixDataOwnership(dir);
    for (const item of stack.items) {
      try {
        await installAddon({
          serverDir: dir,
          type: access.server.type as ServerType,
          mcVersion: access.server.mcVersion,
          projectId: item.projectId,
          versionId: item.versionId,
        });
        installed.push(item.name);
      } catch (err) {
        errors.push({
          name: item.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logActivity({
      action: "addon.install",
      request,
      user: access.user,
      server: access.server,
      metadata: { stackId: stack.id, installed, errors },
    });
    return { stackId: stack.id, installed, errors };
  });

  app.get<{
    Params: { id: string };
    Querystring: { q?: string; source?: string; offset?: string; limit?: string };
  }>("/api/servers/:id/modpacks/search", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "addon.read",
    });
    if (!access) return;
    const source = (request.query.source ?? "modrinth").toLowerCase();
    try {
      const {
        searchModrinthModpacks,
        searchCurseforgeModpacks,
      } = await import("../modpacks.js");
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
        offset: Number(request.query.offset ?? 0) || 0,
        limit: Number(request.query.limit ?? 24) || 24,
      });
      return { ...result, configured: true };
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
      const {
        installModrinthModpack,
        installCurseforgeModpack,
      } = await import("../modpacks.js");
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
      const { installGeyserBundle } = await import("../geyser.js");
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
        await uninstallAddon(
          serverDir(server.id),
          server.type,
          request.params.projectId,
        );
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
