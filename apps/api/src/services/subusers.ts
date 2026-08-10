import { createHash, randomBytes, scryptSync } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  SERVER_PERMISSIONS,
  type AuthUser,
  type CreateSubUserResponse,
  type ServerSubUser,
} from "@guartrix/shared";
import { logActivity } from "../activity-log.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { sendMail } from "../mail.js";
import {
  hashInviteToken,
  isServerOwner,
  isValidEmail,
  normalizeInviteEmail,
  parsePermissionsJson,
  serializePermissions,
  usernameFromEmail,
} from "../servers/server-access.js";
import { ServiceError } from "./errors.js";

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

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

function newInviteToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("hex");
  return {
    raw,
    hash: hashInviteToken(raw),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  };
}

function inviteUrl(raw: string): string {
  return `${panelBaseUrl()}/invite/${encodeURIComponent(raw)}`;
}

export function serializeSubUser(row: {
  id: string;
  serverId: string;
  email: string;
  userId: string | null;
  permissions: string;
  inviteTokenHash?: string | null;
  inviteExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { username: string } | null;
}): ServerSubUser {
  const pending = Boolean(
    row.inviteTokenHash && row.inviteExpiresAt && row.inviteExpiresAt.getTime() > Date.now(),
  );
  return {
    id: row.id,
    serverId: row.serverId,
    email: row.email,
    userId: row.userId,
    username: row.user?.username ?? null,
    permissions: parsePermissionsJson(row.permissions),
    invitePending: pending,
    inviteExpiresAt: row.inviteExpiresAt?.toISOString() ?? null,
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

export const createSubUserSchema = z.object({
  email: z.string().email().max(255),
  permissions: permsSchema,
});

export const updateSubUserSchema = z.object({
  permissions: permsSchema,
});

export type CreateSubUserInput = z.infer<typeof createSubUserSchema>;
export type UpdateSubUserInput = z.infer<typeof updateSubUserSchema>;

type AccessCtx = {
  user: AuthUser;
  server: Server;
  permissions: string[];
};

function assertCanGrantPermissions(access: AccessCtx, permissions: string[]): void {
  if (isServerOwner(access.user, access.server)) return;
  const allowed = new Set(access.permissions);
  for (const p of permissions) {
    if (!allowed.has(p) && !allowed.has("*")) {
      throw new ServiceError(403, `You cannot grant permission you do not have: ${p}`);
    }
  }
}

export async function listServerSubUsers(serverId: string): Promise<{ subusers: ServerSubUser[] }> {
  const rows = await prisma.subUser.findMany({
    where: { serverId },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { subusers: rows.map(serializeSubUser) };
}

export async function createServerSubUser(opts: {
  access: AccessCtx;
  body: CreateSubUserInput;
  request: FastifyRequest;
}): Promise<CreateSubUserResponse> {
  const { access, body, request } = opts;
  const email = normalizeInviteEmail(body.email);
  if (!isValidEmail(email)) {
    throw new ServiceError(400, "Invalid email address");
  }

  if (access.server.ownerId) {
    const owner = await prisma.user.findUnique({
      where: { id: access.server.ownerId },
    });
    if (owner?.email?.toLowerCase() === email || owner?.username.toLowerCase() === email) {
      throw new ServiceError(400, "Cannot invite the server owner as a subuser");
    }
  }

  const existing = await prisma.subUser.findUnique({
    where: {
      serverId_email: { serverId: access.server.id, email },
    },
  });
  if (existing) {
    throw new ServiceError(409, "A subuser with this email already exists");
  }

  assertCanGrantPermissions(access, body.permissions);

  let user = await prisma.user.findFirst({
    where: { email },
  });

  let accountCreated = false;
  if (!user) {
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

  const invite = newInviteToken();
  const row = await prisma.subUser.create({
    data: {
      id: nanoid(12),
      serverId: access.server.id,
      email,
      userId: user.id,
      permissions: serializePermissions(body.permissions),
      inviteTokenHash: invite.hash,
      inviteExpiresAt: invite.expiresAt,
    },
    include: { user: { select: { username: true } } },
  });

  const url = inviteUrl(invite.raw);
  if (!accountCreated) {
    await sendMail({
      to: email,
      subject: `You've been invited to ${access.server.name} on Guartrix`,
      text: [
        `Hi,`,
        "",
        `${access.user.username} invited you to manage “${access.server.name}” on Guartrix.`,
        "Accept the invite (sign in with this email):",
        url,
        "",
        "This link expires in 7 days.",
      ].join("\n"),
    }).catch(() => undefined);
  } else {
    await sendMail({
      to: email,
      subject: `Server invite: ${access.server.name}`,
      text: [`After setting your password, open this invite link to confirm access:`, url].join(
        "\n",
      ),
    }).catch(() => undefined);
  }

  const result: CreateSubUserResponse = {
    subuser: serializeSubUser(row),
    inviteUrl: url,
    ...(accountCreated ? { accountCreated: true } : {}),
  };
  logActivity({
    action: "subuser.create",
    request,
    user: access.user,
    server: access.server,
    metadata: {
      subuser: email,
      permissions: body.permissions,
      accountCreated,
    },
  });
  return result;
}

export async function resendSubUserInvite(opts: {
  access: AccessCtx;
  subUserId: string;
}): Promise<{ subuser: ServerSubUser; inviteUrl: string }> {
  const { access, subUserId } = opts;
  const row = await prisma.subUser.findFirst({
    where: { id: subUserId, serverId: access.server.id },
  });
  if (!row) throw new ServiceError(404, "Subuser not found");

  const invite = newInviteToken();
  const updated = await prisma.subUser.update({
    where: { id: row.id },
    data: {
      inviteTokenHash: invite.hash,
      inviteExpiresAt: invite.expiresAt,
    },
    include: { user: { select: { username: true } } },
  });
  const url = inviteUrl(invite.raw);
  await sendMail({
    to: row.email,
    subject: `Invite to ${access.server.name} on Guartrix`,
    text: [
      `${access.user.username} sent you an invite link for “${access.server.name}”.`,
      url,
      "",
      "Sign in with this email to accept. Expires in 7 days.",
    ].join("\n"),
  }).catch(() => undefined);

  return {
    subuser: serializeSubUser(updated),
    inviteUrl: url,
  };
}

export async function updateServerSubUser(opts: {
  access: AccessCtx;
  subUserId: string;
  body: UpdateSubUserInput;
  request: FastifyRequest;
}): Promise<{ subuser: ServerSubUser }> {
  const { access, subUserId, body, request } = opts;
  const row = await prisma.subUser.findFirst({
    where: { id: subUserId, serverId: access.server.id },
  });
  if (!row) throw new ServiceError(404, "Subuser not found");

  assertCanGrantPermissions(access, body.permissions);

  const updated = await prisma.subUser.update({
    where: { id: row.id },
    data: { permissions: serializePermissions(body.permissions) },
    include: { user: { select: { username: true } } },
  });
  logActivity({
    action: "subuser.update",
    request,
    user: access.user,
    server: access.server,
    metadata: {
      subuser: updated.email,
      permissions: body.permissions,
    },
  });
  return { subuser: serializeSubUser(updated) };
}

export async function deleteServerSubUser(opts: {
  access: AccessCtx;
  subUserId: string;
  request: FastifyRequest;
}): Promise<{ ok: true }> {
  const { access, subUserId, request } = opts;
  const row = await prisma.subUser.findFirst({
    where: { id: subUserId, serverId: access.server.id },
  });
  if (!row) throw new ServiceError(404, "Subuser not found");

  await prisma.subUser.delete({ where: { id: row.id } });
  logActivity({
    action: "subuser.delete",
    request,
    user: access.user,
    server: access.server,
    metadata: { subuser: row.email },
  });
  return { ok: true };
}
