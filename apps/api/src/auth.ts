import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AuthUser, ServerPermission, UserRole } from "@msm/shared";
import { hasPermission } from "@msm/shared";
import {
  apiKeyAllowsServer,
  apiKeyRateLimitedMessage,
  intersectPermissions,
  resolveApiKeyAuth,
} from "./api-keys.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { hashPassword, verifyPassword } from "./password-hash.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
  strongPasswordRefine,
} from "./password-policy.js";
import {
  getServerPermissions,
  isServerOwner,
  userCanAccessServer,
} from "./server-access.js";

export { hashPassword, needsRehash, verifyPassword } from "./password-hash.js";

declare module "fastify" {
  interface Session {
    authenticated?: boolean;
    userId?: string;
    rememberMe?: boolean;
    /** Password accepted, waiting for the TOTP/recovery code. */
    pendingTwoFactorUserId?: string;
    pendingRememberMe?: boolean;
  }
  interface FastifyRequest {
    /** Request-scoped cache for getSessionUser. */
    authUserCache?: AuthUser | null;
    authUserCacheLoaded?: boolean;
  }
}

/** Verify the current session user's password (e.g. destructive actions). */
export async function verifySessionPassword(
  request: FastifyRequest,
  password: string,
): Promise<boolean> {
  if (!password || !request.session.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: request.session.userId } });
  if (!user) return false;
  return verifyPassword(password, user.passwordHash);
}

/** Match usernames case-insensitively. */
export async function findUserByUsernameInsensitive(username: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM User WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByEmailInsensitive(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM User WHERE email IS NOT NULL AND LOWER(email) = ${normalized} LIMIT 1
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine(strongPasswordRefine, { message: passwordPolicyMessage() });

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function panelBaseUrl(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

/** Roles that must have TOTP enabled (TWO_FACTOR_REQUIRED_ROLES). */
export function roleRequiresTwoFactor(role: UserRole): boolean {
  return config.twoFactorRequiredRoles.includes(role);
}

export function toAuthUser(
  user: {
    id: string;
    username: string;
    role: UserRole;
    createdAt: Date;
    maxServers?: number | null;
    maxMemoryMb?: number | null;
    maxDatabases?: number | null;
    totpEnabled?: boolean;
  },
  opts?: {
    serverCount?: number;
    memoryUsedMb?: number;
    databaseCount?: number;
  },
): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: Boolean(user.totpEnabled),
    twoFactorRequired: roleRequiresTwoFactor(user.role),
    maxServers: user.role === "ADMIN" ? null : (user.maxServers ?? null),
    maxMemoryMb: user.role === "ADMIN" ? null : (user.maxMemoryMb ?? null),
    maxDatabases: user.role === "ADMIN" ? null : (user.maxDatabases ?? null),
    ...(opts?.serverCount !== undefined ? { serverCount: opts.serverCount } : {}),
    ...(opts?.memoryUsedMb !== undefined
      ? { memoryUsedMb: opts.memoryUsedMb }
      : {}),
    ...(opts?.databaseCount !== undefined
      ? { databaseCount: opts.databaseCount }
      : {}),
  };
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const count = await prisma.user.count();
  if (count === 0) {
    await prisma.user.create({
      data: {
        id: nanoid(12),
        username: "admin",
        passwordHash: hashPassword(config.adminPassword),
        role: "ADMIN",
        emailVerified: true,
      },
    });
  }

  // Assign orphan servers to the first admin so ownership is always defined
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) {
    await prisma.server.updateMany({
      where: { ownerId: null },
      data: { ownerId: admin.id },
    });
  }
}

export function isAuthenticated(request: FastifyRequest): boolean {
  return Boolean(
    (request.session.authenticated && request.session.userId) ||
      request.apiKeyAuth,
  );
}

async function loadAuthUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (user.role === "ADMIN") {
    return toAuthUser(user);
  }
  const servers = await prisma.server.findMany({
    where: { ownerId: user.id },
    select: { memoryMb: true },
  });
  const databaseCount = await prisma.database.count({
    where: { server: { ownerId: user.id } },
  });
  return toAuthUser(user, {
    serverCount: servers.length,
    memoryUsedMb: servers.reduce((sum, s) => sum + s.memoryMb, 0),
    databaseCount,
  });
}

/**
 * Resolve the acting user from a cookie session or a personal API key
 * (`Authorization: Bearer gt_…`). Daemon Bearer tokens are not handled here.
 * Result is cached on the request for the rest of the hook/handler chain.
 */
export async function getSessionUser(request: FastifyRequest): Promise<AuthUser | null> {
  if (request.authUserCacheLoaded) {
    return request.authUserCache ?? null;
  }

  let user: AuthUser | null = null;
  if (request.session.authenticated && request.session.userId) {
    user = await loadAuthUserById(request.session.userId);
  } else if (request.apiKeyAuth) {
    user = await loadAuthUserById(request.apiKeyAuth.userId);
  } else {
    const resolved = await resolveApiKeyAuth(request);
    if (resolved) user = await loadAuthUserById(resolved.userId);
  }

  request.authUserCache = user;
  request.authUserCacheLoaded = true;
  return user;
}

export function canWriteRole(user: AuthUser): boolean {
  return user.role === "ADMIN" || user.role === "OPERATOR";
}

/** Load a server and enforce ownership / subuser access (+ optional permission). */
export async function requireServerAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  opts?: {
    write?: boolean;
    permission?: ServerPermission | ServerPermission[];
    /** Owner/admin only (e.g. delete server, transfer). */
    ownerOnly?: boolean;
  },
): Promise<{ user: AuthUser; server: Server; permissions: string[] } | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    await reply.status(404).send({ error: "Not found" });
    return null;
  }

  const allowed = await userCanAccessServer(user, server);
  if (!allowed) {
    await reply.status(404).send({ error: "Not found" });
    return null;
  }

  if (!apiKeyAllowsServer(request.apiKeyAuth, server.id)) {
    await reply.status(404).send({ error: "Not found" });
    return null;
  }

  if (opts?.ownerOnly && !isServerOwner(user, server)) {
    await reply.status(403).send({ error: "Only the server owner can do this" });
    return null;
  }

  let permissions = await getServerPermissions(user, server);
  if (request.apiKeyAuth) {
    permissions = intersectPermissions(permissions, request.apiKeyAuth.permissions);
  }

  if (opts?.permission) {
    const need = opts.permission;
    const ok = hasPermission(permissions, need);
    if (!ok) {
      await reply.status(403).send({ error: "Missing permission" });
      return null;
    }
  } else if (opts?.write) {
    // Legacy write flag: owners/admins always; subusers need at least one mutating perm
    // Prefer explicit `permission` on new routes.
    if (!isServerOwner(user, server) && user.role === "VIEWER") {
      await reply.status(403).send({ error: "You cannot modify this server" });
      return null;
    }
    if (!isServerOwner(user, server) && permissions.length === 0) {
      await reply.status(403).send({ error: "You cannot modify this server" });
      return null;
    }
    // API key with empty intersect also blocked.
    if (request.apiKeyAuth && permissions.length === 0) {
      await reply.status(403).send({ error: "Missing permission" });
      return null;
    }
  }

  return { user, server, permissions };
}

export async function listVisibleServers(user: AuthUser, request?: FastifyRequest) {
  const { serverListInclude } = await import("./serialize.js");
  let rows;
  if (user.role === "ADMIN") {
    rows = await prisma.server.findMany({
      orderBy: { createdAt: "desc" },
      include: serverListInclude,
    });
  } else {
    rows = await prisma.server.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { subUsers: { some: { userId: user.id } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: serverListInclude,
    });
  }
  const allow = request?.apiKeyAuth?.serverIds;
  if (allow) {
    const set = new Set(allow);
    rows = rows.filter((s) => set.has(s.id));
  }
  return rows;
}

export async function listVisibleServerIds(
  user: AuthUser,
  request?: FastifyRequest,
): Promise<string[]> {
  let ids: string[];
  if (user.role === "ADMIN") {
    const rows = await prisma.server.findMany({ select: { id: true } });
    ids = rows.map((r) => r.id);
  } else {
    const rows = await prisma.server.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { subUsers: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });
    ids = rows.map((r) => r.id);
  }
  const allow = request?.apiKeyAuth?.serverIds;
  if (allow) {
    const set = new Set(allow);
    ids = ids.filter((id) => set.has(id));
  }
  return ids;
}

/** Guard all /api/servers/:serverId/* routes by ownership or subuser access. */
export function registerOwnershipGuard(app: FastifyInstance): void {
    const collection = new Set([
      "stats",
      "online",
      "updates",
      "addon-updates",
      "import",
    ]);

  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.startsWith("/api/servers/")) return;

    const segment = pathOnly.slice("/api/servers/".length).split("/")[0] ?? "";
    if (!segment || collection.has(segment)) return;

    const user = await getSessionUser(request);
    if (!user) return; // route handler sends 401

    if (!apiKeyAllowsServer(request.apiKeyAuth, segment)) {
      return reply.status(404).send({ error: "Not found" });
    }

    const server = await prisma.server.findUnique({ where: { id: segment } });
    if (!server) {
      return reply.status(404).send({ error: "Not found" });
    }
    if (!(await userCanAccessServer(user, server))) {
      return reply.status(404).send({ error: "Not found" });
    }
  });
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await getSessionUser(request);
  if (!user) {
    const rateMsg = apiKeyRateLimitedMessage(request);
    if (rateMsg) {
      await reply.status(429).send({ error: rateMsg });
      return null;
    }
    await reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  return user;
}

/** Cookie session only — used for API-key management (keys cannot mint keys). */
export async function requireSessionAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  if (!(request.session.authenticated && request.session.userId)) {
    await reply.status(401).send({ error: "Sign in with the panel to manage API keys" });
    return null;
  }
  return requireAuth(request, reply);
}

export async function requireWrite(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (!canWriteRole(user)) {
    await reply.status(403).send({ error: "Viewers cannot change servers" });
    return null;
  }
  return user;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (user.role !== "ADMIN") {
    await reply.status(403).send({ error: "Admin only" });
    return null;
  }
  return user;
}
