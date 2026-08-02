import type { FastifyInstance } from "fastify";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  SERVER_PERMISSIONS,
  type CreateSubUserResponse,
  type ServerSubUser,
} from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { requireServerAccess } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { sendMail } from "../mail.js";
import {
  isServerOwner,
  isValidEmail,
  normalizeInviteEmail,
  parsePermissionsJson,
  serializePermissions,
  usernameFromEmail,
} from "../server-access.js";

function hashPw(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function panelBaseUrl(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

function serializeSubUser(row: {
  id: string;
  serverId: string;
  email: string;
  userId: string | null;
  permissions: string;
  createdAt: Date;
  updatedAt: Date;
  user?: { username: string } | null;
}): ServerSubUser {
  return {
    id: row.id,
    serverId: row.serverId,
    email: row.email,
    userId: row.userId,
    username: row.user?.username ?? null,
    permissions: parsePermissionsJson(row.permissions),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const permsSchema = z
  .array(z.string())
  .max(SERVER_PERMISSIONS.length)
  .transform((arr) =>
    arr.filter((p): p is (typeof SERVER_PERMISSIONS)[number] =>
      (SERVER_PERMISSIONS as readonly string[]).includes(p),
    ),
  );

const createSchema = z.object({
  email: z.string().email().max(255),
  permissions: permsSchema,
});

const updateSchema = z.object({
  permissions: permsSchema,
});

export function registerSubUserRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/subusers",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.read",
      });
      if (!access) return;

      const rows = await prisma.subUser.findMany({
        where: { serverId: access.server.id },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "asc" },
      });
      return { subusers: rows.map(serializeSubUser) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/subusers",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.create",
      });
      if (!access) return;

      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const email = normalizeInviteEmail(parsed.data.email);
      if (!isValidEmail(email)) {
        return reply.status(400).send({ error: "Invalid email address" });
      }

      // Cannot invite the owner as a subuser
      if (access.server.ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: access.server.ownerId },
        });
        if (
          owner?.email?.toLowerCase() === email ||
          owner?.username.toLowerCase() === email
        ) {
          return reply
            .status(400)
            .send({ error: "Cannot invite the server owner as a subuser" });
        }
      }

      const existing = await prisma.subUser.findUnique({
        where: {
          serverId_email: { serverId: access.server.id, email },
        },
      });
      if (existing) {
        return reply
          .status(409)
          .send({ error: "A subuser with this email already exists" });
      }

      // Subusers may not grant permissions they do not have (except owners/admins)
      if (!isServerOwner(access.user, access.server)) {
        const allowed = new Set(access.permissions);
        for (const p of parsed.data.permissions) {
          if (!allowed.has(p) && !allowed.has("*")) {
            return reply
              .status(403)
              .send({
                error: `You cannot grant permission you do not have: ${p}`,
              });
          }
        }
      }

      let user = await prisma.user.findFirst({
        where: { email },
      });

      let accountCreated = false;
      if (!user) {
        // Auto-create panel account with unknown random password; invitee sets it via email.
        let username = usernameFromEmail(email);
        const clash = await prisma.user.findUnique({ where: { username } });
        if (clash) username = `${username}_${nanoid(4)}`.slice(0, 32);
        const randomPassword = randomBytes(32).toString("base64url");
        user = await prisma.user.create({
          data: {
            id: nanoid(12),
            username,
            email,
            emailVerified: true,
            passwordHash: hashPw(randomPassword),
            role: "VIEWER",
            maxServers: 0,
            maxMemoryMb: 0,
            maxDatabases: 0,
          },
        });
        accountCreated = true;

        await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
        const rawToken = randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
          data: {
            id: nanoid(12),
            userId: user.id,
            tokenHash: hashResetToken(rawToken),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
          },
        });
        const resetUrl = `${panelBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendMail({
          to: email,
          subject: "You've been invited to Guartrix — set your password",
          text: [
            `Hi ${username},`,
            "",
            `${access.user.username} invited you to a Minecraft server on Guartrix.`,
            "A panel account was created for you. Set your password within 7 days:",
            resetUrl,
            "",
            "If you did not expect this invite, you can ignore this email.",
          ].join("\n"),
        });
      }

      const row = await prisma.subUser.create({
        data: {
          id: nanoid(12),
          serverId: access.server.id,
          email,
          userId: user.id,
          permissions: serializePermissions(parsed.data.permissions),
        },
        include: { user: { select: { username: true } } },
      });

      const body: CreateSubUserResponse = {
        subuser: serializeSubUser(row),
        ...(accountCreated ? { accountCreated: true } : {}),
      };
      logActivity({
        action: "subuser.create",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          subuser: email,
          permissions: parsed.data.permissions,
          accountCreated,
        },
      });
      return reply.status(201).send(body);
    },
  );

  app.patch<{ Params: { id: string; subUserId: string } }>(
    "/api/servers/:id/subusers/:subUserId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.update",
      });
      if (!access) return;

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const row = await prisma.subUser.findFirst({
        where: { id: request.params.subUserId, serverId: access.server.id },
      });
      if (!row) return reply.status(404).send({ error: "Subuser not found" });

      if (!isServerOwner(access.user, access.server)) {
        const allowed = new Set(access.permissions);
        for (const p of parsed.data.permissions) {
          if (!allowed.has(p) && !allowed.has("*")) {
            return reply
              .status(403)
              .send({
                error: `You cannot grant permission you do not have: ${p}`,
              });
          }
        }
      }

      const updated = await prisma.subUser.update({
        where: { id: row.id },
        data: { permissions: serializePermissions(parsed.data.permissions) },
        include: { user: { select: { username: true } } },
      });
      logActivity({
        action: "subuser.update",
        request,
        user: access.user,
        server: access.server,
        metadata: {
          subuser: updated.email,
          permissions: parsed.data.permissions,
        },
      });
      return { subuser: serializeSubUser(updated) };
    },
  );

  app.delete<{ Params: { id: string; subUserId: string } }>(
    "/api/servers/:id/subusers/:subUserId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "user.delete",
      });
      if (!access) return;

      const row = await prisma.subUser.findFirst({
        where: { id: request.params.subUserId, serverId: access.server.id },
      });
      if (!row) return reply.status(404).send({ error: "Subuser not found" });

      await prisma.subUser.delete({ where: { id: row.id } });
      logActivity({
        action: "subuser.delete",
        request,
        user: access.user,
        server: access.server,
        metadata: { subuser: row.email },
      });
      return { ok: true };
    },
  );
}
