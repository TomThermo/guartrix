import type { FastifyInstance } from "fastify";
import type { UserRole } from "@guartrix/shared";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import {
  assertCanAssignAdminRole,
  findUserByUsernameInsensitive,
  hashPassword,
  passwordSchema,
  requireAdmin,
  requireAuth,
  toAuthUser,
} from "../../auth/auth.js";
import {
  applyRoleChangeQuotas,
  assertNotLastAdmin,
  configQuotaDefaults,
  memoryQuotaSchema,
  PANEL_CREATE_QUOTA_DEFAULTS,
  quotaLimitSchema,
  quotasForCreate,
  usernameSchema,
  userRoleSchema,
} from "../../auth/user-quotas.js";
import { destroySessionsForUser } from "../../auth/session-store.js";
import { prisma } from "../../db.js";
import { sendZodError } from "../../http-error.js";
import {
  hostNodeName,
  hostPublicIp,
  hostTotalMemoryGb,
  hostTotalMemoryMb,
} from "../../nodes/host-resources.js";

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: userRoleSchema,
  maxServers: quotaLimitSchema,
  maxMemoryMb: memoryQuotaSchema(),
  maxDatabases: quotaLimitSchema,
});

const updateUserSchema = z.object({
  password: passwordSchema.optional(),
  role: userRoleSchema.optional(),
  maxServers: quotaLimitSchema,
  maxMemoryMb: memoryQuotaSchema(),
  maxDatabases: quotaLimitSchema,
  /** Admin lockout escape hatch: wipe the user's TOTP so they can re-enrol. */
  disableTwoFactor: z.literal(true).optional(),
});

/** Panel admin user CRUD + system resource peek. */
export function registerPanelUserRoutes(app: FastifyInstance): void {
  app.get("/api/users", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "users.read"))) return;
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        servers: {
          select: {
            memoryMb: true,
            _count: { select: { databases: true } },
          },
        },
      },
    });
    return users.map((u) =>
      toAuthUser(u, {
        serverCount: u.servers.length,
        memoryUsedMb: u.servers.reduce((sum, s) => sum + s.memoryMb, 0),
        databaseCount: u.servers.reduce((sum, s) => sum + s._count.databases, 0),
      }),
    );
  });

  app.get("/api/system", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    try {
      const { daemonGetSystem } = await import("../../nodes/daemon-client.js");
      const sys = await daemonGetSystem();
      return {
        totalMemoryMb: sys.totalMemoryMb,
        totalMemoryGb: sys.totalMemoryGb,
        nodeName: sys.hostname,
        publicIp: sys.publicIp,
      };
    } catch {
      return {
        totalMemoryMb: hostTotalMemoryMb(),
        totalMemoryGb: hostTotalMemoryGb(),
        nodeName: hostNodeName(),
        publicIp: hostPublicIp(),
      };
    }
  });

  app.post("/api/users", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "users.write");
    if (!admin) return;
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed);
    const exists = await findUserByUsernameInsensitive(parsed.data.username);
    if (exists) return reply.status(409).send({ error: "Username already taken" });

    if (parsed.data.role === "ADMIN" && !assertCanAssignAdminRole(request, reply)) {
      return;
    }
    const quotas = quotasForCreate(
      parsed.data.role,
      {
        maxServers: parsed.data.maxServers,
        maxMemoryMb: parsed.data.maxMemoryMb,
        maxDatabases: parsed.data.maxDatabases,
      },
      PANEL_CREATE_QUOTA_DEFAULTS,
    );

    const user = await prisma.user.create({
      data: {
        id: nanoid(12),
        username: parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        emailVerified: true,
        ...quotas,
      },
    });
    logActivity({
      action: "user.create",
      request,
      user: admin,
      metadata: {
        targetUser: user.username,
        role: user.role,
        ...quotas,
      },
    });
    return reply
      .status(201)
      .send(toAuthUser(user, { serverCount: 0, memoryUsedMb: 0, databaseCount: 0 }));
  });

  app.patch<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "users.write");
    if (!admin) return;
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed);
    const existing = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "User not found" });

    const data: {
      passwordHash?: string;
      role?: UserRole;
      maxServers?: number | null;
      maxMemoryMb?: number | null;
      maxDatabases?: number | null;
      totpSecret?: null;
      totpEnabled?: boolean;
      totpRecoveryCodes?: null;
    } = {};
    if (parsed.data.password) data.passwordHash = hashPassword(parsed.data.password);
    if (parsed.data.disableTwoFactor) {
      data.totpSecret = null;
      data.totpEnabled = false;
      data.totpRecoveryCodes = null;
    }
    if (parsed.data.role) data.role = parsed.data.role;
    if (parsed.data.maxServers !== undefined) data.maxServers = parsed.data.maxServers;
    if (parsed.data.maxMemoryMb !== undefined) data.maxMemoryMb = parsed.data.maxMemoryMb;
    if (parsed.data.maxDatabases !== undefined) data.maxDatabases = parsed.data.maxDatabases;

    const nextRole = parsed.data.role;
    if (nextRole === "ADMIN" && !assertCanAssignAdminRole(request, reply)) return;

    const roleResult = await applyRoleChangeQuotas({
      existingRole: existing.role as UserRole,
      nextRole,
      data,
      demoteDefaults: configQuotaDefaults(),
    });
    if (!roleResult.ok) {
      return reply.status(400).send({ error: roleResult.error });
    }

    try {
      const user = await prisma.user.update({
        where: { id: request.params.id },
        data,
        include: {
          servers: {
            select: {
              memoryMb: true,
              _count: { select: { databases: true } },
            },
          },
        },
      });
      if (parsed.data.password) {
        await destroySessionsForUser(user.id);
      }
      logActivity({
        action: "user.update",
        request,
        user: admin,
        metadata: {
          targetUser: user.username,
          fields: Object.keys(parsed.data).filter((k) => k !== "password"),
          passwordChanged: Boolean(parsed.data.password),
        },
      });
      if (nextRole && nextRole !== existing.role) {
        logActivity({
          action: "user.role-change",
          request,
          user: admin,
          metadata: {
            targetUser: user.username,
            from: existing.role,
            to: nextRole,
          },
        });
      }
      if (parsed.data.disableTwoFactor && existing.totpEnabled) {
        logActivity({
          action: "auth.2fa-reset",
          request,
          user: admin,
          metadata: { targetUser: user.username },
        });
      }
      return toAuthUser(user, {
        serverCount: user.servers.length,
        memoryUsedMb: user.servers.reduce((sum, s) => sum + s.memoryMb, 0),
        databaseCount: user.servers.reduce((sum, s) => sum + s._count.databases, 0),
      });
    } catch {
      return reply.status(404).send({ error: "User not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const me = await requireAdmin(request, reply, "users.delete");
    if (!me) return;
    if (me.id === request.params.id) {
      return reply.status(400).send({ error: "Cannot delete your own account" });
    }
    const target = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!target) return reply.status(404).send({ error: "User not found" });
    const lastAdmin = await assertNotLastAdmin({ role: target.role as UserRole });
    if (!lastAdmin.ok) {
      return reply.status(400).send({ error: lastAdmin.error });
    }
    await prisma.server.updateMany({
      where: { ownerId: target.id },
      data: { ownerId: me.id },
    });
    await prisma.user.delete({ where: { id: request.params.id } });
    logActivity({
      action: "user.delete",
      request,
      user: me,
      metadata: { targetUser: target.username, role: target.role },
    });
    return { ok: true };
  });
}
