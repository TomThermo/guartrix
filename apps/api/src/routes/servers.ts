import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AddonSortIndex, ServerType } from "@msm/shared";
import { addonKindFor, hasPermission } from "@msm/shared";
import {
  getSessionUser,
  isAuthenticated,
  listVisibleServerIds,
  listVisibleServers,
  requireServerAccess,
  requireWrite,
  verifySessionPassword,
} from "../auth.js";
import { userHasServerPermission } from "../server-access.js";
import { logActivity } from "../activity-log.js";
import { config, serverDir } from "../config.js";
import { prisma } from "../db.js";
import { destroyServerDatabases } from "./databases.js";
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
import {
  changeFirewallPort,
  closeFirewallPort,
  openFirewallPort,
} from "../firewall.js";
import {
  addIpBan,
  addOp,
  addPlayerBan,
  addWhitelist,
  readBans,
  readPlayers,
  removeIpBan,
  removeOp,
  removePlayerBan,
  removeWhitelist,
  updateIpBan,
  updatePlayerBan,
} from "../players.js";
import { listVersions } from "../providers/jars.js";
import { getAllOnlinePlayers, getOnlinePlayers } from "../online-players.js";
import { processManager, fixDataOwnership } from "../process-manager.js";
import { readServerProperties, updateServerProperties } from "../properties.js";
import {
  syncLocalDirToNode,
  wipeServerEverywhere,
} from "../server-files.js";
import { serverListInclude, toMcServer, toServerDetail } from "../serialize.js";
import { collectServerStats } from "../stats.js";
import {
  applyServerUpdate,
  checkAllServerUpdates,
  checkServerUpdate,
} from "../updates.js";
import {
  applyCreateWorldDefaults,
  applyVersionChangeViaRuntime,
  changeServerType,
  changeTypeRequiresWipeAddons,
  importWorldZip,
  reinstallServer,
  resetWorld,
} from "../server-lifecycle.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
] as const;

const createSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(SERVER_TYPES),
  mcVersion: z.string().min(1),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
  seed: z.string().max(128).optional(),
  gamemode: z.enum(["survival", "creative", "adventure", "spectator"]).optional(),
  difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
  worldPreset: z.enum(["DEFAULT", "FLAT", "VOID"]).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  javaVersion: z
    .enum(["8", "11", "17", "21", "25"])
    .nullable()
    .optional(),
  startupCommand: z.string().max(4000).nullable().optional(),
  serverJar: z.string().min(1).max(128).nullable().optional(),
  javaPath: z.string().nullable().optional(),
  properties: z.record(z.string()).optional(),
  autoRestart: z.boolean().optional(),
  startOnBoot: z.boolean().optional(),
  ownerId: z.string().nullable().optional(),
});

const cloneSchema = z.object({
  name: z.string().min(1).max(64),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
});

const transferSchema = z.object({
  nodeId: z.string().min(1),
  port: z.number().int().min(1024).max(65535).optional(),
  startAfter: z.boolean().optional(),
});

export function registerServerRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.startsWith("/api/servers") && !pathOnly.startsWith("/api/versions")) {
      return;
    }
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (!(await requireWrite(request, reply))) return;
    }
  });

  app.get("/api/servers", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) {
      const { apiKeyRateLimitedMessage } = await import("../api-keys.js");
      const rate = apiKeyRateLimitedMessage(request);
      if (rate) return reply.status(429).send({ error: rate });
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const servers = await listVisibleServers(user, request);
    const { getServerPermissions } = await import("../server-access.js");
    return Promise.all(
      servers.map(async (server) => ({
        ...toMcServer(server),
        permissions: await getServerPermissions(user, server),
      })),
    );
  });

  app.get("/api/servers/stats", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ids = await listVisibleServerIds(user, request);
    const cached = processManager.getAllCachedStats();
    const entries = await Promise.all(
      ids.map(async (id) => {
        if (cached[id]) return [id, cached[id]] as const;
        return [id, await collectServerStats(id)] as const;
      }),
    );
    return Object.fromEntries(entries);
  });

  app.get("/api/servers/online", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ids = await listVisibleServerIds(user, request);
    return getAllOnlinePlayers(ids);
  });

  app.get("/api/servers/updates", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const ids = new Set(await listVisibleServerIds(user, request));
    const all = await checkAllServerUpdates();
    return Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
  });

  app.get("/api/servers/addon-updates", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });
    const servers = await listVisibleServers(user, request);
    const eligible = servers.filter((s) => addonKindFor(s.type as ServerType));

    const out: Record<string, { available: number }> = {};
    let next = 0;
    const workers = Array.from(
      { length: Math.min(2, Math.max(eligible.length, 1)) },
      async () => {
        while (next < eligible.length) {
          const i = next++;
          const s = eligible[i]!;
          const allowed = await userHasServerPermission(
            user,
            { id: s.id, ownerId: s.ownerId },
            "addon.read",
          );
          if (!allowed) continue;
          try {
            const updates = await checkInstalledAddonUpdates({
              serverDir: serverDir(s.id),
              type: s.type as ServerType,
              mcVersion: s.mcVersion,
            });
            out[s.id] = {
              available: updates.filter((u) => u.available).length,
            };
          } catch {
            out[s.id] = { available: 0 };
          }
        }
      },
    );
    await Promise.all(workers);
    return out;
  });

  app.get<{ Params: { id: string }; Querystring: { disk?: string } }>(
    "/api/servers/:id/stats",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id);
      if (!access) return;
      return collectServerStats(access.server.id, {
        includeDisk: request.query.disk === "1" || request.query.disk === "true",
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/stats/history",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id);
      if (!access) return;
      const { getStatsHistory } = await import("../stats-history.js");
      return { samples: getStatsHistory(access.server.id) };
    },
  );

  app.get<{ Params: { id: string } }>("/api/servers/:id/online", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.read",
    });
    if (!access) return;
    const server = access.server;
    // Refresh tracked list via /list once the JVM is fully ready (no artificial wait —
    // console parse + daemon cache catch up on the next poll).
    if (
      processManager.isRunning(server.id) &&
      processManager.getStatus(server.id) === "RUNNING"
    ) {
      try {
        processManager.sendCommand(server.id, "list");
      } catch {
        // ignore
      }
    }
    return getOnlinePlayers(server.id);
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/updates", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    try {
      return await checkServerUpdate(access.server);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
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
      const message = err instanceof Error ? err.message : String(err);
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

  app.get<{ Params: { id: string } }>("/api/servers/:id", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id);
    if (!access) return;
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    const properties = await readServerProperties(server.id);
    const players = await readPlayers(server.id);
    const detail = toServerDetail(server, properties, players);
    return {
      ...detail,
      isOwner:
        access.user.role === "ADMIN" || access.server.ownerId === access.user.id,
      permissions: access.permissions,
    };
  });

  app.post("/api/servers", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;

    try {
      const { assertCanCreateServer } = await import("../quotas.js");
      await assertCanCreateServer(user, data.memoryMb);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(403).send({ error: message });
    }

    if (data.nodeId && user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Only admins can choose a node" });
    }

    let nodeId: string;
    try {
      const { assertNodeCapacity, resolveCreateNodeId } = await import(
        "../nodes.js"
      );
      nodeId = await resolveCreateNodeId(
        user.role === "ADMIN" ? data.nodeId : undefined,
      );
      await assertNodeCapacity(nodeId, data.memoryMb);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    try {
      const { provisionPreparedServer } = await import("../server-provision.js");
      const { server: updated } = await provisionPreparedServer({
        name: data.name,
        type: data.type as ServerType,
        mcVersion: data.mcVersion,
        port: data.port,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        ownerId: user.id,
        nodeId,
        ensureSubdomain: true,
        cleanupOnFailure: true,
      });

      const preset = data.worldPreset ?? "DEFAULT";
      const levelType =
        preset === "FLAT" ? "flat" : preset === "VOID" ? "flat" : undefined;
      const generatorSettings =
        preset === "VOID"
          ? JSON.stringify({
              layers: [{ block: "minecraft:air", height: 1 }],
              biome: "minecraft:the_void",
            })
          : undefined;
      await applyCreateWorldDefaults(updated.id, {
        seed: data.seed,
        gamemode: data.gamemode,
        difficulty: data.difficulty,
        levelType,
        generatorSettings,
      }).catch((err) => {
        console.warn(
          `[guartrix] create world defaults failed for ${updated.id}:`,
          err instanceof Error ? err.message : err,
        );
      });

      logActivity({
        action: "server.create",
        request,
        user,
        server: updated,
        metadata: {
          type: updated.type,
          mcVersion: updated.mcVersion,
          port: updated.port,
          memoryMb: updated.memoryMb,
          diskMb: updated.diskMb,
          node: nodeId,
          worldPreset: preset,
        },
      });
      return reply.status(201).send(toMcServer(updated));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.create",
        request,
        user,
        serverId: null,
        serverName: data.name,
        success: false,
        metadata: { error: message, type: data.type, port: data.port },
      });
      const status = message.includes("already in use") ? 409 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.patch<{ Params: { id: string } }>("/api/servers/:id", async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const access = await requireServerAccess(request, reply, request.params.id);
    if (!access) return;
    const server = access.server;
    const data = parsed.data;

    const needsSettings =
      data.name !== undefined ||
      data.properties !== undefined ||
      data.port !== undefined;
    const needsStartup =
      data.memoryMb !== undefined ||
      data.javaPath !== undefined ||
      data.javaVersion !== undefined ||
      data.startupCommand !== undefined ||
      data.serverJar !== undefined ||
      data.autoRestart !== undefined ||
      data.startOnBoot !== undefined;

    if (needsSettings && !hasPermission(access.permissions, "settings.update")) {
      return reply.status(403).send({ error: "Missing permission" });
    }
    if (needsStartup && !hasPermission(access.permissions, "startup.update")) {
      return reply.status(403).send({ error: "Missing permission" });
    }

    if (data.ownerId !== undefined) {
      if (access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can reassign ownership" });
      }
      if (data.ownerId !== null) {
        const owner = await prisma.user.findUnique({ where: { id: data.ownerId } });
        if (!owner) return reply.status(400).send({ error: "Owner user not found" });
        if (data.ownerId !== server.ownerId) {
          try {
            const { assertCanAllocateMemory } = await import("../quotas.js");
            await assertCanAllocateMemory(
              owner,
              data.memoryMb ?? server.memoryMb,
              { extraServer: true },
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.status(403).send({ error: message });
          }
        }
      }
    }

    if (data.memoryMb !== undefined && data.memoryMb !== server.memoryMb) {
      if (access.user.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Only admins can change server memory" });
      }
      const ownerId = data.ownerId !== undefined ? data.ownerId : server.ownerId;
      if (ownerId) {
        const owner =
          ownerId === access.user.id
            ? access.user
            : await prisma.user.findUnique({ where: { id: ownerId } });
        if (owner) {
          try {
            const { assertCanAllocateMemory } = await import("../quotas.js");
            await assertCanAllocateMemory(owner, data.memoryMb, {
              excludeServerId: server.id,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.status(403).send({ error: message });
          }
        }
      }

      if (server.nodeId) {
        try {
          const { assertNodeCapacity } = await import("../nodes.js");
          await assertNodeCapacity(server.nodeId, data.memoryMb, {
            excludeServerId: server.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(403).send({ error: message });
        }
      }
    }

    const portChanging = data.port !== undefined && data.port !== server.port;

    if (portChanging) {
      if (processManager.isRunning(server.id) || server.status === "RUNNING") {
        return reply.status(409).send({ error: "Stop the server before changing the port" });
      }
      const free = await processManager.isPortFree(data.port!, server.id, server.nodeId);
      if (!free) {
        return reply.status(409).send({ error: `Port ${data.port} is already in use` });
      }
    }

    if (data.properties || data.port !== undefined) {
      await updateServerProperties(
        server.id,
        data.properties ?? {},
        data.port,
      );
    }

    // javaVersion is stored in javaPath (major version string).
    let nextJavaPath: string | null | undefined = undefined;
    if (data.javaVersion !== undefined) {
      nextJavaPath = data.javaVersion;
    } else if (data.javaPath !== undefined) {
      nextJavaPath = data.javaPath;
    }

    if (data.startupCommand !== undefined && data.startupCommand !== null) {
      const trimmed = data.startupCommand.trim();
      if (trimmed) {
        try {
          const {
            resolveStartupCommand,
            startupCommandToArgs,
            normalizeServerJar,
            assertSafeStartupCommand,
          } = await import("@msm/shared");
          const jar = normalizeServerJar(
            data.serverJar !== undefined ? data.serverJar : server.serverJar,
          );
          const mem = data.memoryMb ?? server.memoryMb;
          startupCommandToArgs(resolveStartupCommand(trimmed, mem, jar));
          assertSafeStartupCommand(trimmed, mem, jar);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({ error: `Invalid startup command: ${message}` });
        }
      }
    } else if (
      data.memoryMb !== undefined &&
      data.memoryMb !== server.memoryMb &&
      server.startupCommand?.trim()
    ) {
      // Memory lowered/changed — existing hard-coded -Xmx must still fit.
      try {
        const { assertSafeStartupCommand, normalizeServerJar } = await import(
          "@msm/shared"
        );
        assertSafeStartupCommand(
          server.startupCommand,
          data.memoryMb,
          normalizeServerJar(
            data.serverJar !== undefined ? data.serverJar : server.serverJar,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          error: `Cannot set memory: startup command heap exceeds new limit. ${message}`,
        });
      }
    }

    let nextServerJar: string | null | undefined = undefined;
    if (data.serverJar !== undefined) {
      if (data.serverJar === null || !data.serverJar.trim()) {
        nextServerJar = null;
      } else {
        try {
          const { normalizeServerJar } = await import("@msm/shared");
          nextServerJar = normalizeServerJar(data.serverJar);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(400).send({ error: message });
        }
      }
    }

    const updated = await prisma.server.update({
      where: { id: server.id },
      data: {
        name: data.name,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        port: data.port,
        javaPath: nextJavaPath,
        startupCommand:
          data.startupCommand === undefined
            ? undefined
            : data.startupCommand === null || !data.startupCommand.trim()
              ? null
              : data.startupCommand.trim(),
        serverJar: nextServerJar,
        autoRestart: data.autoRestart,
        startOnBoot: data.startOnBoot,
        ownerId: data.ownerId === undefined ? undefined : data.ownerId,
      },
      include: serverListInclude,
    });

    if (data.diskMb !== undefined || data.cpuLimit !== undefined) {
      try {
        const { daemonSetLimits } = await import("../daemon-client.js");
        await daemonSetLimits(server.id, {
          diskMb: updated.diskMb,
          cpuLimit: updated.cpuLimit,
        });
      } catch {
        // applied again on next start
      }
    }

    if (portChanging) {
      try {
        await changeFirewallPort(server.port, data.port!, server.nodeId);
        if (server.nodeId) {
          const { ensurePrimaryAllocation } = await import("../allocations.js");
          await ensurePrimaryAllocation({
            serverId: server.id,
            nodeId: server.nodeId,
            port: data.port!,
          });
        }
      } catch (err) {
        await prisma.server.update({
          where: { id: server.id },
          data: { port: server.port },
        });
        await updateServerProperties(server.id, {}, server.port);
        await closeFirewallPort(data.port!, server.nodeId).catch(() => undefined);
        await openFirewallPort(server.port, server.nodeId).catch(() => undefined);
        if (server.nodeId) {
          const { ensurePrimaryAllocation } = await import("../allocations.js");
          await ensurePrimaryAllocation({
            serverId: server.id,
            nodeId: server.nodeId,
            port: server.port,
          }).catch(() => undefined);
        }
        const message = err instanceof Error ? err.message : String(err);
        return reply
          .status(500)
          .send({ error: `Firewall update failed: ${message}` });
      }

      if (updated.subdomain) {
        try {
          const { ensureServerSubdomain, cloudflareConfigured } = await import(
            "../cloudflare-dns.js"
          );
          if (cloudflareConfigured()) {
            const { hostPublicIp } = await import("../host-resources.js");
            const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)
              ? config.publicHost
              : hostPublicIp();
            if (!ipv4) throw new Error("No public IPv4 available for Cloudflare A record");
            const slug = updated.subdomain!;
            await ensureServerSubdomain({
              preferredSlug: slug,
              currentSlug: slug,
              port: data.port!,
              ipv4,
            });
          }
        } catch (dnsErr) {
          const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
          console.warn(`[guartrix] Cloudflare SRV update failed: ${msg}`);
        }
      }
    }

    const changedFields = (
      [
        "name",
        "memoryMb",
        "diskMb",
        "cpuLimit",
        "port",
        "javaVersion",
        "javaPath",
        "startupCommand",
        "serverJar",
        "autoRestart",
        "startOnBoot",
      ] as const
    ).filter((key) => data[key] !== undefined);

    if (changedFields.length > 0) {
      logActivity({
        action: needsStartup ? "settings.startup" : "settings.update",
        request,
        user: access.user,
        server: updated,
        metadata: {
          fields: [...changedFields],
          ...(data.name !== undefined && data.name !== server.name
            ? { renamedFrom: server.name }
            : {}),
          ...(portChanging ? { fromPort: server.port, toPort: updated.port } : {}),
        },
      });
    }
    if (data.properties && Object.keys(data.properties).length > 0) {
      logActivity({
        action: "settings.properties",
        request,
        user: access.user,
        server: updated,
        metadata: { keys: Object.keys(data.properties) },
      });
    }
    if (data.ownerId !== undefined && data.ownerId !== server.ownerId) {
      logActivity({
        action: "server.owner-change",
        request,
        user: access.user,
        server: updated,
        metadata: { fromOwnerId: server.ownerId, toOwnerId: data.ownerId },
      });
    }

    const properties = await readServerProperties(updated.id);
    const players = await readPlayers(updated.id);

    // Live whitelist toggle when server is running
    if (
      data.properties?.["white-list"] !== undefined &&
      processManager.isRunning(updated.id)
    ) {
      const on = data.properties["white-list"] === "true";
      try {
        processManager.sendCommand(updated.id, on ? "whitelist on" : "whitelist off");
      } catch {
        // ignore
      }
    }

    return toServerDetail(updated, properties, players);
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/players", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.read",
    });
    if (!access) return;
    return readPlayers(access.server.id);
  });

  app.post<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/servers/:id/whitelist",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;
      const name = request.body?.name?.trim();
      if (!name) return reply.status(400).send({ error: "name is required" });
      try {
        const result = await addWhitelist(
          access.server.id,
          serverDir(access.server.id),
          name,
        );
        logActivity({
          action: "player.whitelist-add",
          request,
          user: access.user,
          server: access.server,
          metadata: { player: name },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; name: string } }>(
    "/api/servers/:id/whitelist/:name",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;
      try {
        const player = decodeURIComponent(request.params.name);
        const result = await removeWhitelist(
          access.server.id,
          serverDir(access.server.id),
          player,
        );
        logActivity({
          action: "player.whitelist-remove",
          request,
          user: access.user,
          server: access.server,
          metadata: { player },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { name?: string; level?: number } }>(
    "/api/servers/:id/ops",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;
      const name = request.body?.name?.trim();
      if (!name) return reply.status(400).send({ error: "name is required" });
      try {
        const level = request.body?.level ?? 4;
        const result = await addOp(
          access.server.id,
          serverDir(access.server.id),
          name,
          level,
        );
        logActivity({
          action: "player.op",
          request,
          user: access.user,
          server: access.server,
          metadata: { player: name, level },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; name: string } }>(
    "/api/servers/:id/ops/:name",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;
      try {
        const player = decodeURIComponent(request.params.name);
        const result = await removeOp(
          access.server.id,
          serverDir(access.server.id),
          player,
        );
        logActivity({
          action: "player.deop",
          request,
          user: access.user,
          server: access.server,
          metadata: { player },
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/api/servers/:id/bans", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.read",
    });
    if (!access) return;
    return readBans(access.server.id);
  });

  app.post<{
    Params: { id: string };
    Body: { name?: string; reason?: string; expires?: string };
  }>("/api/servers/:id/bans/players", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    const name = request.body?.name?.trim();
    if (!name) return reply.status(400).send({ error: "name is required" });
    try {
      await fixDataOwnership(serverDir(access.server.id));
      const result = await addPlayerBan(
        access.server.id,
        serverDir(access.server.id),
        name,
        request.body?.reason,
        request.body?.expires,
      );
      logActivity({
        action: "player.ban",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          player: name,
          reason: request.body?.reason,
          expires: request.body?.expires,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.patch<{
    Params: { id: string; name: string };
    Body: { reason?: string; expires?: string };
  }>("/api/servers/:id/bans/players/:name", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    try {
      await fixDataOwnership(serverDir(access.server.id));
      return await updatePlayerBan(
        access.server.id,
        serverDir(access.server.id),
        decodeURIComponent(request.params.name),
        {
          reason: request.body?.reason,
          expires: request.body?.expires,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string; name: string } }>(
    "/api/servers/:id/bans/players/:name",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;
      try {
        await fixDataOwnership(serverDir(access.server.id));
        const player = decodeURIComponent(request.params.name);
        const result = await removePlayerBan(
          access.server.id,
          serverDir(access.server.id),
          player,
        );
        logActivity({
          action: "player.unban",
          request,
          user: access.user,
          server: access.server,
          metadata: { player },
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
    Body: { ip?: string; reason?: string; expires?: string };
  }>("/api/servers/:id/bans/ips", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    const ip = request.body?.ip?.trim();
    if (!ip) return reply.status(400).send({ error: "ip is required" });
    try {
      await fixDataOwnership(serverDir(access.server.id));
      const result = await addIpBan(
        access.server.id,
        serverDir(access.server.id),
        ip,
        request.body?.reason,
        request.body?.expires,
      );
      logActivity({
        action: "player.ban",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          ip,
          reason: request.body?.reason,
          expires: request.body?.expires,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.patch<{
    Params: { id: string; ip: string };
    Body: { reason?: string; expires?: string };
  }>("/api/servers/:id/bans/ips/:ip", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "player.update",
    });
    if (!access) return;
    try {
      await fixDataOwnership(serverDir(access.server.id));
      return await updateIpBan(
        access.server.id,
        serverDir(access.server.id),
        decodeURIComponent(request.params.ip),
        {
          reason: request.body?.reason,
          expires: request.body?.expires,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string; ip: string } }>(
    "/api/servers/:id/bans/ips/:ip",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "player.update",
      });
      if (!access) return;
      try {
        await fixDataOwnership(serverDir(access.server.id));
        const ip = decodeURIComponent(request.params.ip);
        const result = await removeIpBan(
          access.server.id,
          serverDir(access.server.id),
          ip,
        );
        logActivity({
          action: "player.unban",
          request,
          user: access.user,
          server: access.server,
          metadata: { ip },
        });
        return result;
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

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/engine",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.read",
      });
      if (!access) return;
      const { getEngineSettings } = await import("../engine-config.js");
      return getEngineSettings(access.server.id, access.server.type as ServerType);
    },
  );

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
      const { updateEngineSettings } = await import("../engine-config.js");
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
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
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

  app.delete<{ Params: { id: string }; Body: { password?: string } }>(
    "/api/servers/:id",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const server = access.server;

      const password =
        typeof request.body?.password === "string" ? request.body.password : "";
      if (!password) {
        return reply
          .status(400)
          .send({ error: "Password is required to delete this server" });
      }
      if (!(await verifySessionPassword(request, password))) {
        return reply.status(403).send({ error: "Incorrect password" });
      }

      if (server.status === "TRANSFERRING" || server.status === "CREATING") {
        return reply
          .status(409)
          .send({ error: "Server is busy — wait for the current operation to finish" });
      }

      if (processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }

      const subdomain = server.subdomain;
      const nodeId = server.nodeId;
      const {
        closeServerAllocationFirewalls,
        releaseServerAllocations,
      } = await import("../allocations.js");
      await closeServerAllocationFirewalls(server.id, nodeId).catch(() => undefined);
      await destroyServerDatabases(server.id).catch(() => undefined);
      await wipeServerEverywhere(server.id).catch(() => undefined);
      await releaseServerAllocations(server.id).catch(() => undefined);
      await prisma.server.delete({ where: { id: server.id } });
      logActivity({
        action: "server.delete",
        request,
        user: access.user,
        serverId: null,
        serverName: server.name,
        metadata: { serverId: server.id, port: server.port, node: nodeId },
      });
      try {
        const { deleteServerSubdomain } = await import("../cloudflare-dns.js");
        await deleteServerSubdomain(subdomain);
      } catch (dnsErr) {
        const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
        console.warn(`[guartrix] Cloudflare subdomain cleanup failed: ${msg}`);
      }
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>("/api/servers/:id/start", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.start",
    });
    if (!access) return;
    const server = access.server;
    try {
      const { assertLicenseAllowsPower, assertLicensePanelQuota } = await import(
        "../license.js"
      );
      await assertLicenseAllowsPower();
      await assertLicensePanelQuota(server.memoryMb, {
        excludeServerId: server.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_INVALID",
      });
    }
    if (server.status === "TRANSFERRING" || server.status === "CREATING") {
      return reply
        .status(409)
        .send({ error: "Server is busy — wait for the current operation to finish" });
    }
    try {
      const { openServerAllocationFirewalls } = await import("../allocations.js");
      await openServerAllocationFirewalls(server.id, server.nodeId);
      const { startServerIfLicensed } = await import("../license.js");
      await startServerIfLicensed(server.id);
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
        include: serverListInclude,
      });
      logActivity({
        action: "server.start",
        request,
        user: access.user,
        server,
      });
      return toMcServer(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.start",
        request,
        user: access.user,
        server,
        success: false,
        metadata: { error: message },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/stop", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.stop",
    });
    if (!access) return;
    await processManager.stop(access.server.id);
    const updated = await prisma.server.findUniqueOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    logActivity({
      action: "server.stop",
      request,
      user: access.user,
      server: access.server,
    });
    return toMcServer(updated);
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/kill", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.kill",
    });
    if (!access) return;
    await processManager.kill(access.server.id);
    const updated = await prisma.server.findUniqueOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    logActivity({
      action: "server.kill",
      request,
      user: access.user,
      server: access.server,
    });
    return toMcServer(updated);
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/restart", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.restart",
    });
    if (!access) return;
    const server = access.server;
    try {
      const { assertLicenseAllowsPower, assertLicensePanelQuota } = await import(
        "../license.js"
      );
      await assertLicenseAllowsPower();
      await assertLicensePanelQuota(server.memoryMb, {
        excludeServerId: server.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_INVALID",
      });
    }
    try {
      if (processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }
      await openFirewallPort(server.port, server.nodeId);
      const { startServerIfLicensed } = await import("../license.js");
      await startServerIfLicensed(server.id);
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
        include: serverListInclude,
      });
      logActivity({
        action: "server.restart",
        request,
        user: access.user,
        server,
      });
      return toMcServer(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.restart",
        request,
        user: access.user,
        server,
        success: false,
        metadata: { error: message },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Querystring: { type?: string } }>("/api/versions", async (request, reply) => {
    const type = (request.query.type ?? "VANILLA").toUpperCase();
    if (!(SERVER_TYPES as readonly string[]).includes(type)) {
      return reply.status(400).send({ error: "Invalid type" });
    }
    try {
      const versions = await listVersions(type as ServerType);
      return { type, versions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/connect", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "allocation.read",
    });
    if (!access) return;
    const server = access.server;
    const properties = await readServerProperties(server.id);
    const { hostPublicIp } = await import("../host-resources.js");
    const publicIp = hostPublicIp();
    const directIp =
      /^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)
        ? config.publicHost
        : publicIp;

    let host = config.publicHost;
    let address = `${host}:${server.port}`;
    let subdomainFqdn: string | null = null;
    if (server.subdomain && config.cloudflare.domain) {
      subdomainFqdn = `${server.subdomain}.${config.cloudflare.domain}`;
      host = subdomainFqdn;
      // SRV record lets Java clients connect without :port
      address = subdomainFqdn;
    }

    const node = server.nodeId
      ? await prisma.node.findUnique({ where: { id: server.nodeId } })
      : await prisma.node.findFirst({ where: { isLocal: true } });

    const canSftp = await userHasServerPermission(
      access.user,
      server,
      "file.sftp",
    );
    const sftpHost = node?.sftpHostname ?? null;
    const sftpPort = node?.sftpPort ?? 2022;
    const sftpEnabled = Boolean(canSftp && sftpHost);

    return {
      host,
      port: server.port,
      address,
      directIp,
      subdomain: subdomainFqdn,
      motd: properties.motd ?? "A Minecraft Server",
      maxPlayers: properties["max-players"] ?? "20",
      onlineMode: properties["online-mode"] !== "false",
      whitelistEnabled: properties["white-list"] === "true",
      sftpEnabled,
      sftpHost: sftpEnabled ? sftpHost : null,
      sftpPort: sftpEnabled ? sftpPort : null,
      sftpUsername: sftpEnabled
        ? `${access.user.username}.${server.id}`
        : null,
    };
  });

  app.get<{ Params: { id: string } }>("/api/servers/:id/disk", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "settings.read",
    });
    if (!access) return;
    const { daemonDisk } = await import("../daemon-client.js");
    return daemonDisk(access.server.id);
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/transfer",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      if (access.user.role !== "ADMIN") {
        return reply
          .status(403)
          .send({ error: "Only admins can move servers between nodes" });
      }
      const parsed = transferSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const { startServerTransfer, getTransferJob } = await import(
          "../transfer.js"
        );
        const job = await startServerTransfer({
          serverId: access.server.id,
          toNodeId: parsed.data.nodeId,
          port: parsed.data.port,
          startAfter: parsed.data.startAfter,
          actor: access.user,
        });
        const updated = await prisma.server.findUniqueOrThrow({
          where: { id: access.server.id },
          include: serverListInclude,
        });
        return reply.status(202).send({
          server: toMcServer(updated),
          transfer: job ?? getTransferJob(access.server.id),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/transfer",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const { getTransferJob } = await import("../transfer.js");
      const job = getTransferJob(access.server.id);
      if (!job) {
        return {
          transfer: null,
          server: toMcServer(
            await prisma.server.findUniqueOrThrow({
              where: { id: access.server.id },
              include: serverListInclude,
            }),
          ),
        };
      }
      return {
        transfer: job,
        server: toMcServer(
          await prisma.server.findUniqueOrThrow({
            where: { id: access.server.id },
            include: serverListInclude,
          }),
        ),
      };
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/clone",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const source = access.server;
      const parsed = cloneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (processManager.isRunning(source.id)) {
        return reply.status(409).send({ error: "Stop the server before cloning" });
      }
      if (access.user.role === "VIEWER") {
        return reply.status(403).send({ error: "Viewers cannot clone servers" });
      }
      if (parsed.data.nodeId && access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can choose a node" });
      }
      const memoryMb = parsed.data.memoryMb ?? source.memoryMb;
      try {
        const { assertCanCreateServer } = await import("../quotas.js");
        await assertCanCreateServer(access.user, memoryMb);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(403).send({ error: message });
      }

      let nodeId: string;
      try {
        const { assertNodeCapacity, resolveCreateNodeId } = await import(
          "../nodes.js"
        );
        nodeId = await resolveCreateNodeId(
          access.user.role === "ADMIN"
            ? (parsed.data.nodeId ?? source.nodeId)
            : source.nodeId,
        );
        await assertNodeCapacity(nodeId, memoryMb);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }

      const free = await processManager.isPortFree(
        parsed.data.port,
        undefined,
        nodeId,
      );
      if (!free) {
        return reply.status(409).send({ error: `Port ${parsed.data.port} is already in use` });
      }

      const id = nanoid(12);
      const destNode = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!destNode) {
        return reply.status(400).send({ error: "Node not found" });
      }

      await prisma.server.create({
        data: {
          id,
          name: parsed.data.name,
          type: source.type,
          mcVersion: source.mcVersion,
          port: parsed.data.port,
          memoryMb,
          diskMb: parsed.data.diskMb ?? source.diskMb,
          cpuLimit: parsed.data.cpuLimit ?? source.cpuLimit,
          status: "CREATING",
          javaPath: source.javaPath,
          startupCommand: source.startupCommand,
          serverJar: source.serverJar,
          fabricLoaderVersion: source.fabricLoaderVersion,
          forgeVersion: source.forgeVersion,
          paperBuild: source.paperBuild,
          autoRestart: source.autoRestart,
          startOnBoot: false,
          ownerId: access.user.id,
          nodeId,
        },
      });

      const staging = await fs.mkdtemp(
        path.join(os.tmpdir(), `guartrix-clone-${id}-`),
      );
      const { tryEnsureServerSubdomain, cleanupFailedProvision } = await import(
        "../server-provision.js"
      );
      try {
        await openFirewallPort(parsed.data.port, nodeId);
        const { ensurePrimaryAllocation } = await import("../allocations.js");
        await ensurePrimaryAllocation({
          serverId: id,
          nodeId,
          port: parsed.data.port,
        });

        // Pull source files via daemon export (stream to disk — avoid OOM on large worlds)
        const archivePath = path.join(staging, "source.tar.gz");
        const { daemonExportArchiveToFile } = await import("../daemon-client.js");
        await daemonExportArchiveToFile(source.id, archivePath);
        await execFileAsync("tar", ["-xzf", archivePath, "-C", staging], {
          maxBuffer: 32 * 1024 * 1024,
        });
        await fs.rm(archivePath, { force: true });
        await fs.rm(path.join(staging, "logs"), { recursive: true, force: true }).catch(() => undefined);
        await fs.rm(path.join(staging, "crash-reports"), { recursive: true, force: true }).catch(() => undefined);
        await fs.rm(path.join(staging, "session.lock"), { force: true }).catch(() => undefined);

        await syncLocalDirToNode(id, nodeId, staging);
        await updateServerProperties(id, {}, parsed.data.port);

        const subdomain = await tryEnsureServerSubdomain(
          parsed.data.name,
          parsed.data.port,
        );

        const updated = await prisma.server.update({
          where: { id },
          data: { status: "STOPPED", errorMessage: null, subdomain },
          include: serverListInclude,
        });
        logActivity({
          action: "server.clone",
          request,
          user: access.user,
          server: updated,
          metadata: {
            clonedFrom: source.name,
            sourceId: source.id,
            port: updated.port,
            node: nodeId,
          },
        });
        return reply.status(201).send(toMcServer(updated));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity({
          action: "server.clone",
          request,
          user: access.user,
          server: source,
          success: false,
          metadata: { error: message, name: parsed.data.name },
        });
        await cleanupFailedProvision(id, parsed.data.port, nodeId);
        return reply.status(500).send({ error: message });
      } finally {
        await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );
}
