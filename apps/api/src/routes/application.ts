import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  APPLICATION_API_KEY_MAX,
  normalizeApplicationScopes,
  type AuthUser,
  type UserRole,
} from "@msm/shared";
import {
  generateApplicationToken,
  toApplicationKeyRecord,
} from "../auth/application-keys.js";
import { requireApplication } from "../auth/application-auth.js";
import { logActivity } from "../activity-log.js";
import {
  findUserByUsernameInsensitive,
  hashPassword,
  requireAdmin,
} from "../auth/auth.js";
import { assertSameOrigin } from "../auth/csrf.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
  strongPasswordRefine,
} from "../auth/password-policy.js";
import { prisma } from "../db.js";
import { serverListInclude, toMcServer } from "../servers/serialize.js";

function toAppUser(user: {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  maxServers: number | null;
  maxMemoryMb: number | null;
  maxDatabases: number | null;
  email: string | null;
  emailVerified: boolean;
}): AuthUser & { email: string | null; emailVerified: boolean } {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: false,
    twoFactorRequired: false,
    maxServers: user.role === "ADMIN" ? null : user.maxServers,
    maxMemoryMb: user.role === "ADMIN" ? null : user.maxMemoryMb,
    maxDatabases: user.role === "ADMIN" ? null : user.maxDatabases,
    serverCount: 0,
    memoryUsedMb: 0,
    databaseCount: 0,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}

const quotaLimit = z.number().int().min(0).max(100_000).nullable();

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .refine(strongPasswordRefine, { message: passwordPolicyMessage() }),
  email: z.string().email().max(200).nullable().optional(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).default("OPERATOR"),
  maxServers: quotaLimit.optional(),
  maxMemoryMb: quotaLimit.optional(),
  maxDatabases: quotaLimit.optional(),
});

const updateUserSchema = z.object({
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .refine(strongPasswordRefine, { message: passwordPolicyMessage() })
    .optional(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
  maxServers: quotaLimit.optional(),
  maxMemoryMb: quotaLimit.optional(),
  maxDatabases: quotaLimit.optional(),
  email: z.string().email().max(200).nullable().optional(),
});

const createServerSchema = z.object({
  ownerId: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  type: z.enum([
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
  ]),
  mcVersion: z.string().min(1).max(32),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  diskMb: z.number().int().min(1024).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(6400).optional(),
  nodeId: z.string().min(1).optional(),
});

/** Admin session routes for managing Application API keys. */
export function registerApplicationKeyAdminRoutes(app: FastifyInstance): void {
  app.get("/api/admin/application-keys", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const rows = await prisma.applicationApiKey.findMany({
      orderBy: { createdAt: "desc" },
    });
    return {
      keys: rows.map(toApplicationKeyRecord),
      maxKeys: APPLICATION_API_KEY_MAX,
    };
  });

  app.post("/api/admin/application-keys", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAdmin(request, reply);
    if (!user) return;

    const parsed = z
      .object({
        name: z.string().trim().min(1).max(64),
        scopes: z.array(z.string()).min(1).max(32),
        note: z.string().max(200).nullable().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const scopes = normalizeApplicationScopes(parsed.data.scopes);
    if (!scopes) {
      return reply.status(400).send({
        error: 'scopes must be known Application API scopes, or ["*"]',
      });
    }

    const active = await prisma.applicationApiKey.count({
      where: { revokedAt: null },
    });
    if (active >= APPLICATION_API_KEY_MAX) {
      return reply.status(400).send({
        error: `At most ${APPLICATION_API_KEY_MAX} active Application API keys`,
      });
    }

    const { token, prefix, tokenHash } = generateApplicationToken();
    const row = await prisma.applicationApiKey.create({
      data: {
        id: nanoid(12),
        name: parsed.data.name,
        prefix,
        tokenHash,
        scopes: JSON.stringify(scopes),
        note: parsed.data.note?.trim() || null,
      },
    });

    logActivity({
      action: "application-key.create",
      request,
      user,
      metadata: { keyId: row.id, name: row.name, prefix, scopes },
    });

    return reply.status(201).send({
      key: toApplicationKeyRecord(row),
      token,
    });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/admin/application-keys/:id",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireAdmin(request, reply);
      if (!user) return;

      const row = await prisma.applicationApiKey.findUnique({
        where: { id: request.params.id },
      });
      if (!row) return reply.status(404).send({ error: "Key not found" });
      if (row.revokedAt) {
        return reply.status(400).send({ error: "Already revoked" });
      }
      const updated = await prisma.applicationApiKey.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      logActivity({
        action: "application-key.revoke",
        request,
        user,
        metadata: { keyId: row.id, name: row.name, prefix: row.prefix },
      });
      return { key: toApplicationKeyRecord(updated) };
    },
  );
}

/** Machine Application API under /api/application/* */
export function registerApplicationRoutes(app: FastifyInstance): void {
  app.get("/api/application/users", async (request, reply) => {
    if (!(await requireApplication(request, reply, "users.read"))) return;
    const rows = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return { users: rows.map(toAppUser) };
  });

  app.get<{ Params: { id: string } }>(
    "/api/application/users/:id",
    async (request, reply) => {
      if (!(await requireApplication(request, reply, "users.read"))) return;
      const user = await prisma.user.findUnique({
        where: { id: request.params.id },
      });
      if (!user) return reply.status(404).send({ error: "User not found" });
      return { user: toAppUser(user) };
    },
  );

  app.post("/api/application/users", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "users.write");
    if (!ctx) return;
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    if (await findUserByUsernameInsensitive(parsed.data.username)) {
      return reply.status(409).send({ error: "Username already taken" });
    }

    const isAdminRole = parsed.data.role === "ADMIN";
    const user = await prisma.user.create({
      data: {
        id: nanoid(12),
        username: parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        email: parsed.data.email ?? null,
        emailVerified: true,
        maxServers: isAdminRole ? null : (parsed.data.maxServers ?? 0),
        maxMemoryMb: isAdminRole ? null : (parsed.data.maxMemoryMb ?? 0),
        maxDatabases: isAdminRole ? null : (parsed.data.maxDatabases ?? 0),
      },
    });

    logActivity({
      action: "user.create",
      actor: `app:${ctx.prefix}`,
      metadata: {
        targetUser: user.username,
        role: user.role,
        via: "application-api",
        keyId: ctx.keyId,
      },
    });

    return reply.status(201).send({ user: toAppUser(user) });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/application/users/:id",
    async (request, reply) => {
      const ctx = await requireApplication(request, reply, "users.write");
      if (!ctx) return;
      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const existing = await prisma.user.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "User not found" });

      const data: {
        passwordHash?: string;
        role?: UserRole;
        maxServers?: number | null;
        maxMemoryMb?: number | null;
        maxDatabases?: number | null;
        email?: string | null;
      } = {};
      if (parsed.data.password) data.passwordHash = hashPassword(parsed.data.password);
      if (parsed.data.role) data.role = parsed.data.role;
      if (parsed.data.maxServers !== undefined) data.maxServers = parsed.data.maxServers;
      if (parsed.data.maxMemoryMb !== undefined) data.maxMemoryMb = parsed.data.maxMemoryMb;
      if (parsed.data.maxDatabases !== undefined) data.maxDatabases = parsed.data.maxDatabases;
      if (parsed.data.email !== undefined) data.email = parsed.data.email;

      if (parsed.data.role === "ADMIN") {
        data.maxServers = null;
        data.maxMemoryMb = null;
        data.maxDatabases = null;
      }

      const user = await prisma.user.update({
        where: { id: existing.id },
        data,
      });
      logActivity({
        action: "user.update",
        actor: `app:${ctx.prefix}`,
        metadata: {
          targetUser: user.username,
          fields: Object.keys(parsed.data),
          via: "application-api",
          keyId: ctx.keyId,
        },
      });
      return { user: toAppUser(user) };
    },
  );

  app.get("/api/application/servers", async (request, reply) => {
    if (!(await requireApplication(request, reply, "servers.read"))) return;
    const rows = await prisma.server.findMany({
      include: serverListInclude,
      orderBy: { createdAt: "desc" },
    });
    return { servers: rows.map(toMcServer) };
  });

  app.post("/api/application/servers", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "servers.write");
    if (!ctx) return;
    const parsed = createServerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;
    const owner = await prisma.user.findUnique({ where: { id: data.ownerId } });
    if (!owner) return reply.status(404).send({ error: "Owner not found" });

    try {
      const { assertCanCreateServer } = await import("../billing/quotas.js");
      await assertCanCreateServer(
        {
          id: owner.id,
          role: owner.role,
          maxServers: owner.maxServers,
          maxMemoryMb: owner.maxMemoryMb,
          maxDatabases: owner.maxDatabases,
        },
        data.memoryMb,
        { diskMb: data.diskMb },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(403).send({ error: message });
    }

    let nodeId: string;
    try {
      const { assertNodeCapacity, resolveCreateNodeId } = await import("../nodes/nodes.js");
      nodeId = await resolveCreateNodeId(data.nodeId);
      await assertNodeCapacity(nodeId, data.memoryMb);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    try {
      const { provisionPreparedServer, autoStartProvisionedServer } = await import(
        "../servers/server-provision.js",
      );
      const { id, server: updated } = await provisionPreparedServer({
        name: data.name,
        type: data.type,
        mcVersion: data.mcVersion,
        port: data.port,
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
        ownerId: owner.id,
        nodeId,
        cleanupOnFailure: false,
      });

      await autoStartProvisionedServer(id);

      const refreshed = await prisma.server.findUniqueOrThrow({
        where: { id },
        include: serverListInclude,
      });

      logActivity({
        action: "server.create",
        actor: `app:${ctx.prefix}`,
        serverId: id,
        serverName: refreshed.name,
        metadata: {
          ownerId: owner.id,
          owner: owner.username,
          via: "application-api",
          keyId: ctx.keyId,
        },
      });

      return reply.status(201).send({ server: toMcServer(refreshed) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("already in use") ? 409 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/api/application/users/:id",
    async (request, reply) => {
      const ctx = await requireApplication(request, reply, "users.delete");
      if (!ctx) return;
      const existing = await prisma.user.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "User not found" });
      if (existing.role === "ADMIN") {
        const admins = await prisma.user.count({ where: { role: "ADMIN" } });
        if (admins <= 1) {
          return reply.status(400).send({ error: "Cannot delete the last admin" });
        }
      }
      await prisma.user.delete({ where: { id: existing.id } });
      logActivity({
        action: "user.delete",
        actor: `app:${ctx.prefix}`,
        metadata: {
          targetUser: existing.username,
          via: "application-api",
          keyId: ctx.keyId,
        },
      });
      return reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/application/servers/:id",
    async (request, reply) => {
      if (!(await requireApplication(request, reply, "servers.read"))) return;
      const row = await prisma.server.findUnique({
        where: { id: request.params.id },
        include: serverListInclude,
      });
      if (!row) return reply.status(404).send({ error: "Server not found" });
      return { server: toMcServer(row) };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/application/servers/:id",
    async (request, reply) => {
      const ctx = await requireApplication(request, reply, "servers.update");
      if (!ctx) return;
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(64).optional(),
          memoryMb: z.number().int().min(512).max(65536).optional(),
          diskMb: z.number().int().min(1024).max(10_485_760).optional(),
          cpuLimit: z.number().int().min(0).max(6400).optional(),
          ownerId: z.string().min(1).optional(),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const existing = await prisma.server.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Server not found" });

      if (parsed.data.ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: parsed.data.ownerId },
        });
        if (!owner) return reply.status(404).send({ error: "Owner not found" });
      }

      const updated = await prisma.server.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
          ...(parsed.data.memoryMb != null ? { memoryMb: parsed.data.memoryMb } : {}),
          ...(parsed.data.diskMb != null ? { diskMb: parsed.data.diskMb } : {}),
          ...(parsed.data.cpuLimit != null ? { cpuLimit: parsed.data.cpuLimit } : {}),
          ...(parsed.data.ownerId != null ? { ownerId: parsed.data.ownerId } : {}),
        },
        include: serverListInclude,
      });

      logActivity({
        action: "server.update",
        actor: `app:${ctx.prefix}`,
        serverId: updated.id,
        serverName: updated.name,
        metadata: { fields: Object.keys(parsed.data), via: "application-api", keyId: ctx.keyId },
      });

      return { server: toMcServer(updated) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/application/servers/:id",
    async (request, reply) => {
      const ctx = await requireApplication(request, reply, "servers.delete");
      if (!ctx) return;
      const server = await prisma.server.findUnique({
        where: { id: request.params.id },
      });
      if (!server) return reply.status(404).send({ error: "Server not found" });

      const { processManager } = await import("../servers/process-manager.js");
      const { destroyServerDatabases } = await import("./databases.js");
      const { wipeServerEverywhere } = await import("../servers/server-files.js");

      if (server.status === "TRANSFERRING" || server.status === "CREATING") {
        return reply
          .status(409)
          .send({ error: "Server is busy — wait for the current operation to finish" });
      }
      if (processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }
      const {
        closeServerAllocationFirewalls,
        releaseServerAllocations,
      } = await import("../servers/allocations.js");
      await closeServerAllocationFirewalls(server.id, server.nodeId).catch(() => undefined);
      await destroyServerDatabases(server.id).catch(() => undefined);
      await wipeServerEverywhere(server.id).catch(() => undefined);
      await releaseServerAllocations(server.id).catch(() => undefined);
      await prisma.server.delete({ where: { id: server.id } });

      logActivity({
        action: "server.delete",
        actor: `app:${ctx.prefix}`,
        serverId: null,
        serverName: server.name,
        metadata: { serverId: server.id, via: "application-api", keyId: ctx.keyId },
      });

      return reply.status(204).send();
    },
  );

  app.get("/api/application/nodes", async (request, reply) => {
    if (!(await requireApplication(request, reply, "nodes.read"))) return;
    const { listNodesWithUsage } = await import("../nodes/nodes.js");
    return { nodes: await listNodesWithUsage() };
  });

  app.get("/api/application/activity", async (request, reply) => {
    if (!(await requireApplication(request, reply, "activity.read"))) return;
    const parsed = z
      .object({
        offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
        limit: z.coerce.number().int().min(1).max(200).optional().default(50),
        q: z.string().max(120).optional(),
        serverId: z.string().max(64).optional(),
        userId: z.string().max(64).optional(),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { offset, limit, q, serverId, userId } = parsed.data;
    const where: {
      serverId?: string;
      userId?: string;
      OR?: Array<{ action?: { contains: string }; actorName?: { contains: string } }>;
    } = {};
    if (serverId) where.serverId = serverId;
    if (userId) where.userId = userId;
    if (q?.trim()) {
      const term = q.trim();
      where.OR = [{ action: { contains: term } }, { actorName: { contains: term } }];
    }
    const [total, rows] = await Promise.all([
      prisma.activityEvent.count({ where }),
      prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);
    const { toActivityRecord } = await import("../activity-log.js");
    return {
      total,
      offset,
      limit,
      events: rows.map(toActivityRecord),
    };
  });

  app.get("/api/application/settings", async (request, reply) => {
    if (!(await requireApplication(request, reply, "settings.read"))) return;
    const { getPanelSettingsView } = await import("../panel-settings.js");
    const view = await getPanelSettingsView();
    return {
      publicHost: view.publicHost,
      publicBaseUrl: view.publicBaseUrl,
      registrationEnabled: view.registrationEnabled,
      defaultMaxServers: view.defaultMaxServers,
      defaultMaxMemoryMb: view.defaultMaxMemoryMb,
      defaultMaxDatabases: view.defaultMaxDatabases,
    };
  });
}
