import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { UserRole } from "@guartrix/shared";
import {
  applicationQuotaLimitSchema,
  userRoleSchema,
} from "@guartrix/shared/schemas/auth";
import { requireApplication } from "../../auth/application-auth.js";
import { findUserByUsernameInsensitive, hashPassword, passwordSchema } from "../../auth/auth.js";
import { destroySessionsForUser } from "../../auth/session-store.js";
import {
  APPLICATION_CREATE_QUOTA_DEFAULTS,
  applyRoleChangeQuotas,
  assertNotLastAdmin,
  configQuotaDefaults,
  quotasForCreate,
} from "../../auth/user-quotas.js";
import { logActivity } from "../../activity-log.js";
import { sendZodError } from "../../http-error.js";
import { toAppUser } from "./helpers.js";
import { countUsers, createUser, deleteUser, findManyUsers, findUser, updateUser } from "../../services/users.js";

/** Minting/promoting ADMIN needs a full Application key (`*`), not users.write alone. */
function canAssignAdminRole(scopes: readonly string[]): boolean {
  return scopes.includes("*");
}

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: passwordSchema,
  email: z.string().email().max(200).nullable().optional(),
  role: userRoleSchema.default("OPERATOR"),
  maxServers: applicationQuotaLimitSchema.optional(),
  maxMemoryMb: applicationQuotaLimitSchema.optional(),
  maxDatabases: applicationQuotaLimitSchema.optional(),
});

const updateUserSchema = z.object({
  password: passwordSchema.optional(),
  role: userRoleSchema.optional(),
  maxServers: applicationQuotaLimitSchema.optional(),
  maxMemoryMb: applicationQuotaLimitSchema.optional(),
  maxDatabases: applicationQuotaLimitSchema.optional(),
  email: z.string().email().max(200).nullable().optional(),
});

export function registerApplicationUserRoutes(app: FastifyInstance): void {
  app.get("/api/application/users", async (request, reply) => {
    if (!(await requireApplication(request, reply, "users.read"))) return;
    const q = (request.query ?? {}) as Record<string, unknown>;
    const limit = Math.min(
      500,
      Math.max(1, Math.floor(Number.isFinite(Number(q.limit)) ? Number(q.limit) : 100)),
    );
    const offset = Math.max(
      0,
      Math.floor(Number.isFinite(Number(q.offset)) ? Number(q.offset) : 0),
    );
    const [rows, total] = await Promise.all([
      findManyUsers({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      countUsers(),
    ]);
    void reply.header("x-total-count", String(total));
    return { users: rows.map(toAppUser), total, limit, offset };
  });

  app.get<{ Params: { id: string } }>("/api/application/users/:id", async (request, reply) => {
    if (!(await requireApplication(request, reply, "users.read"))) return;
    const user = await findUser({
      where: { id: request.params.id },
    });
    if (!user) return reply.status(404).send({ error: "User not found" });
    return { user: toAppUser(user) };
  });

  app.post("/api/application/users", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "users.write");
    if (!ctx) return;
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed);

    if (await findUserByUsernameInsensitive(parsed.data.username)) {
      return reply.status(409).send({ error: "Username already taken" });
    }

    if (parsed.data.role === "ADMIN" && !canAssignAdminRole(ctx.scopes)) {
      return reply.status(403).send({
        error:
          "Creating ADMIN accounts requires Application scope * (users.write alone is not enough)",
      });
    }
    const quotas = quotasForCreate(
      parsed.data.role,
      {
        maxServers: parsed.data.maxServers,
        maxMemoryMb: parsed.data.maxMemoryMb,
        maxDatabases: parsed.data.maxDatabases,
      },
      APPLICATION_CREATE_QUOTA_DEFAULTS,
    );
    const user = await createUser({
      data: {
        id: nanoid(12),
        username: parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        email: parsed.data.email ?? null,
        emailVerified: true,
        ...quotas,
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

  app.patch<{ Params: { id: string } }>("/api/application/users/:id", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "users.write");
    if (!ctx) return;
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) return sendZodError(reply, parsed);
    const existing = await findUser({
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

    const nextRole = parsed.data.role;
    if (nextRole === "ADMIN" && !canAssignAdminRole(ctx.scopes)) {
      return reply.status(403).send({
        error: "Promoting to ADMIN requires Application scope * (users.write alone is not enough)",
      });
    }

    const roleResult = await applyRoleChangeQuotas({
      existingRole: existing.role as UserRole,
      nextRole,
      data,
      demoteDefaults: configQuotaDefaults(),
    });
    if (!roleResult.ok) {
      return reply.status(400).send({ error: roleResult.error });
    }

    const user = await updateUser({
      where: { id: existing.id },
      data,
    });
    if (parsed.data.password) {
      await destroySessionsForUser(user.id);
    }
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
  });

  app.delete<{ Params: { id: string } }>("/api/application/users/:id", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "users.delete");
    if (!ctx) return;
    const existing = await findUser({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "User not found" });
    const lastAdmin = await assertNotLastAdmin({
      role: existing.role as UserRole,
    });
    if (!lastAdmin.ok) {
      return reply.status(400).send({ error: lastAdmin.error });
    }
    await deleteUser({ where: { id: existing.id } });
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
  });
}
