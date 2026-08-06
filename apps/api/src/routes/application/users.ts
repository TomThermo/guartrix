import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { UserRole } from "@msm/shared";
import { requireApplication } from "../../auth/application-auth.js";
import {
  findUserByUsernameInsensitive,
  hashPassword,
} from "../../auth/auth.js";
import { destroySessionsForUser } from "../../auth/session-store.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
  strongPasswordRefine,
} from "../../auth/password-policy.js";
import { logActivity } from "../../activity-log.js";
import { prisma } from "../../db.js";
import { toAppUser } from "./helpers.js";

/** Minting/promoting ADMIN needs a full Application key (`*`), not users.write alone. */
function canAssignAdminRole(scopes: readonly string[]): boolean {
  return scopes.includes("*");
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

export function registerApplicationUserRoutes(app: FastifyInstance): void {
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
    if (isAdminRole && !canAssignAdminRole(ctx.scopes)) {
      return reply.status(403).send({
        error:
          "Creating ADMIN accounts requires Application scope * (users.write alone is not enough)",
      });
    }
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

      const nextRole = parsed.data.role;
      if (nextRole === "ADMIN") {
        if (!canAssignAdminRole(ctx.scopes)) {
          return reply.status(403).send({
            error:
              "Promoting to ADMIN requires Application scope * (users.write alone is not enough)",
          });
        }
        data.maxServers = null;
        data.maxMemoryMb = null;
        data.maxDatabases = null;
      } else if (nextRole && existing.role === "ADMIN") {
        const admins = await prisma.user.count({ where: { role: "ADMIN" } });
        if (admins <= 1) {
          return reply
            .status(400)
            .send({ error: "Cannot demote the last admin" });
        }
      }

      const user = await prisma.user.update({
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
    },
  );

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
}
