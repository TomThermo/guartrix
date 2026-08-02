import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AuthUser, ServerPermission, UserRole } from "@msm/shared";
import { hasPermission } from "@msm/shared";
import { logActivity } from "./activity-log.js";
import {
  apiKeyAllowsServer,
  apiKeyRateLimitedMessage,
  intersectPermissions,
  resolveApiKeyAuth,
} from "./api-keys.js";
import { config } from "./config.js";
import { assertSameOrigin } from "./csrf.js";
import { prisma } from "./db.js";
import { hostNodeName, hostPublicIp, hostTotalMemoryGb, hostTotalMemoryMb } from "./host-resources.js";
import { sendMail } from "./mail.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
  strongPasswordRefine,
} from "./password-policy.js";
import { destroySessionsForUser } from "./session-store.js";
import { consumeRecoveryCode, verifyTotp } from "./totp.js";
import {
  getServerPermissions,
  isServerOwner,
  linkPendingSubUsers,
  userCanAccessServer,
} from "./server-access.js";

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

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
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

async function findUserByEmailInsensitive(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM User WHERE email IS NOT NULL AND LOWER(email) = ${normalized} LIMIT 1
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine(strongPasswordRefine, { message: passwordPolicyMessage() });

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function panelBaseUrl(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

/** Roles that must have TOTP enabled (TWO_FACTOR_REQUIRED_ROLES). */
export function roleRequiresTwoFactor(role: UserRole): boolean {
  return config.twoFactorRequiredRoles.includes(role);
}

function toAuthUser(
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

const quotaLimitSchema = z
  .number()
  .int()
  .min(0)
  .max(10_000)
  .nullable()
  .optional();

function memoryQuotaSchema() {
  // Cap at host RAM (UI uses 1 GB steps → GB × 1024 MB). Allow 0 for "no plan".
  return z.number().int().min(0).max(hostTotalMemoryMb()).nullable().optional();
}

const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_\-]+$/);

const emailSchema = z.string().trim().email().max(254);

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
  maxServers: quotaLimitSchema,
  maxMemoryMb: memoryQuotaSchema(),
  maxDatabases: quotaLimitSchema,
});

const updateUserSchema = z.object({
  password: passwordSchema.optional(),
  role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]).optional(),
  maxServers: quotaLimitSchema,
  maxMemoryMb: memoryQuotaSchema(),
  maxDatabases: quotaLimitSchema,
  /** Admin lockout escape hatch: wipe the user's TOTP so they can re-enrol. */
  disableTwoFactor: z.literal(true).optional(),
});

const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service" }),
  }),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: FastifyRequest): string {
  return request.ip || "unknown";
}

function checkLoginRate(request: FastifyRequest): string | null {
  const key = clientKey(request);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return null;
  }
  entry.count += 1;
  if (entry.count > 20) {
    return "Too many login attempts. Try again in 15 minutes.";
  }
  return null;
}

function clearLoginRate(request: FastifyRequest): void {
  loginAttempts.delete(clientKey(request));
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/api/auth/me", async (request) => {
    const user = await getSessionUser(request);
    return { authenticated: Boolean(user), user };
  });

  app.get("/api/auth/config", async () => ({
    registrationEnabled: config.registrationEnabled,
    passwordMinLength: PASSWORD_MIN_LENGTH,
    passwordPolicy: passwordPolicyMessage(),
  }));

  app.post<{ Body: { username?: string; password?: string; rememberMe?: boolean } }>(
    "/api/auth/login",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });

      const limited = checkLoginRate(request);
      if (limited) {
        return reply.status(429).send({ error: limited });
      }

      await ensureBootstrapAdmin();
      const password = request.body?.password ?? "";
      const username = (request.body?.username ?? "").trim();
      if (!username) {
        return reply.status(400).send({ error: "Username is required" });
      }
      if (password.length > PASSWORD_MAX_LENGTH) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }
      const rememberMe = Boolean(request.body?.rememberMe);

      const user = await findUserByUsernameInsensitive(username);
      // Always run a verify (dummy hash when missing) to reduce timing leaks.
      const ok = user
        ? verifyPassword(password, user.passwordHash)
        : verifyPassword(password, hashPassword("timing-dummy"));
      if (!user || !ok) {
        logActivity({
          action: "auth.login-failed",
          request,
          user: user ? { id: user.id, username: user.username } : null,
          actor: username,
          success: false,
          metadata: { username, reason: user ? "wrong password" : "unknown user" },
        });
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Password accepted but 2FA is on: park the login until the code arrives.
      // The rate-limit counter is only cleared after the second step succeeds.
      if (user.totpEnabled) {
        await request.session.regenerate();
        request.session.pendingTwoFactorUserId = user.id;
        request.session.pendingRememberMe = rememberMe;
        request.session.cookie.maxAge = 1000 * 60 * 10;
        return { ok: true, requiresTwoFactor: true };
      }

      clearLoginRate(request);
      await request.session.regenerate();
      request.session.authenticated = true;
      request.session.userId = user.id;
      request.session.rememberMe = rememberMe;

      // Remember me: 30 days. Otherwise: 1 day (still restored after API restart via file store).
      request.session.cookie.maxAge = rememberMe
        ? 1000 * 60 * 60 * 24 * 30
        : 1000 * 60 * 60 * 24;

      // Only link pending subuser invites after email is verified (blocks invite hijack).
      if (user.emailVerified) {
        await linkPendingSubUsers(user.id, user.email);
      }

      logActivity({
        action: "auth.login",
        request,
        user,
        metadata: { rememberMe },
      });

      const sessionUser = await getSessionUser(request);
      return { ok: true, user: sessionUser ?? toAuthUser(user) };
    },
  );

  app.post<{ Body: { code?: string } }>(
    "/api/auth/login/2fa",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });

      const limited = checkLoginRate(request);
      if (limited) {
        return reply.status(429).send({ error: limited });
      }

      const pendingUserId = request.session.pendingTwoFactorUserId;
      if (!pendingUserId) {
        return reply
          .status(401)
          .send({ error: "Sign in with your password first" });
      }
      const user = await prisma.user.findUnique({ where: { id: pendingUserId } });
      if (!user || !user.totpEnabled || !user.totpSecret) {
        await request.session.destroy().catch(() => undefined);
        return reply
          .status(401)
          .send({ error: "Sign in with your password first" });
      }

      const code = (request.body?.code ?? "").trim();
      if (!code || code.length > 64) {
        return reply.status(400).send({ error: "Code is required" });
      }

      let usedRecovery = false;
      if (!verifyTotp(user.totpSecret, code)) {
        const remaining = consumeRecoveryCode(user.totpRecoveryCodes, code);
        if (remaining === null) {
          logActivity({
            action: "auth.login-failed",
            request,
            user,
            success: false,
            metadata: { username: user.username, reason: "invalid two-factor code" },
          });
          return reply.status(401).send({ error: "Invalid two-factor code" });
        }
        usedRecovery = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { totpRecoveryCodes: JSON.stringify(remaining) },
        });
        logActivity({
          action: "auth.2fa-recovery-used",
          request,
          user,
          metadata: { remainingCodes: remaining.length },
        });
      }

      const rememberMe = Boolean(request.session.pendingRememberMe);
      clearLoginRate(request);
      await request.session.regenerate();
      request.session.pendingTwoFactorUserId = undefined;
      request.session.pendingRememberMe = undefined;
      request.session.authenticated = true;
      request.session.userId = user.id;
      request.session.rememberMe = rememberMe;
      request.session.cookie.maxAge = rememberMe
        ? 1000 * 60 * 60 * 24 * 30
        : 1000 * 60 * 60 * 24;

      if (user.emailVerified) {
        await linkPendingSubUsers(user.id, user.email);
      }

      logActivity({
        action: "auth.login",
        request,
        user,
        metadata: { rememberMe, twoFactor: true, recoveryCode: usedRecovery },
      });

      const sessionUser = await getSessionUser(request);
      return { ok: true, user: sessionUser ?? toAuthUser(user) };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    const who = await getSessionUser(request);
    if (who) {
      logActivity({ action: "auth.logout", request, user: who });
    }
    try {
      await request.session.destroy();
    } catch {
      // still report logout locally
    }
    if (originErr) return reply.status(403).send({ error: originErr, ok: true });
    return { ok: true };
  });

  app.post("/api/auth/register", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    if (!config.registrationEnabled) {
      return reply.status(403).send({ error: "Registration is disabled" });
    }

    const limited = checkLoginRate(request);
    if (limited) return reply.status(429).send({ error: limited });

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first =
        flat.fieldErrors.password?.[0] ||
        flat.fieldErrors.acceptTerms?.[0] ||
        flat.fieldErrors.email?.[0] ||
        flat.fieldErrors.username?.[0] ||
        flat.formErrors[0] ||
        "Invalid registration data";
      return reply.status(400).send({ error: first });
    }

    const { username, email, password } = parsed.data;
    const emailNorm = email.trim().toLowerCase();

    if (await findUserByUsernameInsensitive(username)) {
      return reply.status(409).send({ error: "Username already taken" });
    }
    if (await findUserByEmailInsensitive(emailNorm)) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    let user;
    try {
      user = await prisma.user.create({
        data: {
          id: nanoid(12),
          username,
          email: emailNorm,
          emailVerified: false,
          passwordHash: hashPassword(password),
          role: "OPERATOR",
          maxServers: Number.isFinite(config.defaultMaxServers)
            ? Math.max(0, config.defaultMaxServers)
            : 0,
          maxMemoryMb: Number.isFinite(config.defaultMaxMemoryMb)
            ? Math.max(0, config.defaultMaxMemoryMb)
            : 0,
          maxDatabases: Number.isFinite(config.defaultMaxDatabases)
            ? Math.max(0, config.defaultMaxDatabases)
            : 0,
        },
      });
    } catch {
      return reply.status(409).send({ error: "Username or email already taken" });
    }

    // Email verification required before pending subuser invites are linked.
    const rawToken = randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: {
        id: nanoid(12),
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + 48 * 60 * 60_000),
      },
    });
    const verifyUrl = `${panelBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await sendMail({
      to: emailNorm,
      subject: "Verify your Guartrix email",
      text: [
        `Hi ${username},`,
        "",
        "Confirm your email to finish setting up your Guartrix account:",
        verifyUrl,
        "",
        "This link expires in 48 hours.",
      ].join("\n"),
    });

    clearLoginRate(request);
    logActivity({
      action: "auth.register",
      request,
      user,
      metadata: { email: emailNorm },
    });
    await request.session.regenerate();
    request.session.authenticated = true;
    request.session.userId = user.id;
    request.session.rememberMe = false;
    request.session.cookie.maxAge = 1000 * 60 * 60 * 24;

    const sessionUser = await getSessionUser(request);
    return reply.status(201).send({
      ok: true,
      emailVerificationRequired: true,
      user: sessionUser ?? toAuthUser(user, {
        serverCount: 0,
        memoryUsedMb: 0,
        databaseCount: 0,
      }),
    });
  });

  app.post("/api/auth/verify-email", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const token =
      typeof (request.body as { token?: string })?.token === "string"
        ? (request.body as { token: string }).token.trim()
        : "";
    if (!token || token.length < 20) {
      return reply.status(400).send({ error: "Invalid verification link" });
    }

    const row = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      include: { user: true },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return reply.status(400).send({ error: "Verification link is invalid or expired" });
    }

    await prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: true },
    });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } });
    await linkPendingSubUsers(row.userId, row.user.email);
    logActivity({ action: "auth.email-verified", request, user: row.user });

    return { ok: true, message: "Email verified." };
  });

  app.post("/api/auth/forgot-password", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const limited = checkLoginRate(request);
    if (limited) return reply.status(429).send({ error: limited });

    const parsed = forgotPasswordSchema.safeParse(request.body);
    // Always return the same message (no account enumeration)
    const okBody = {
      ok: true,
      message:
        "If an account exists for that email, a reset link has been sent.",
    };
    if (!parsed.success) return okBody;

    const user = await findUserByEmailInsensitive(parsed.data.email);
    if (!user?.email) return okBody;

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        id: nanoid(12),
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    const resetUrl = `${panelBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendMail({
      to: user.email,
      subject: "Reset your Guartrix password",
      text: [
        `Hi ${user.username},`,
        "",
        "We received a request to reset your Guartrix panel password.",
        `Open this link within 1 hour:`,
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    });

    logActivity({ action: "auth.password-reset-request", request, user });

    return okBody;
  });

  app.post("/api/auth/reset-password", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const limited = checkLoginRate(request);
    if (limited) return reply.status(429).send({ error: limited });

    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first =
        flat.fieldErrors.password?.[0] ||
        flat.fieldErrors.token?.[0] ||
        "Invalid reset request";
      return reply.status(400).send({ error: first });
    }

    const tokenHash = hashResetToken(parsed.data.token);
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return reply.status(400).send({ error: "Reset link is invalid or expired" });
    }

    await prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
    });
    await prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } });
    await destroySessionsForUser(row.userId);
    clearLoginRate(request);
    logActivity({ action: "auth.password-reset", request, user: row.user });

    return { ok: true, message: "Password updated. You can sign in now." };
  });

  app.get("/api/users", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
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
      const { daemonGetSystem } = await import("./daemon-client.js");
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
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const exists = await findUserByUsernameInsensitive(parsed.data.username);
    if (exists) return reply.status(409).send({ error: "Username already taken" });

    const isAdminRole = parsed.data.role === "ADMIN";
    const maxServers = isAdminRole
      ? null
      : parsed.data.maxServers === undefined
        ? 1
        : parsed.data.maxServers;
    const maxMemoryMb = isAdminRole
      ? null
      : parsed.data.maxMemoryMb === undefined
        ? 4096
        : parsed.data.maxMemoryMb;
    const maxDatabases = isAdminRole
      ? null
      : parsed.data.maxDatabases === undefined
        ? 3
        : parsed.data.maxDatabases;

    const user = await prisma.user.create({
      data: {
        id: nanoid(12),
        username: parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        emailVerified: true,
        maxServers,
        maxMemoryMb,
        maxDatabases,
      },
    });
    logActivity({
      action: "user.create",
      request,
      user: admin,
      metadata: {
        targetUser: user.username,
        role: user.role,
        maxServers,
        maxMemoryMb,
        maxDatabases,
      },
    });
    return reply.status(201).send(
      toAuthUser(user, { serverCount: 0, memoryUsedMb: 0, databaseCount: 0 }),
    );
  });

  app.patch<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
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
    if (nextRole === "ADMIN") {
      data.maxServers = null;
      data.maxMemoryMb = null;
      data.maxDatabases = null;
    } else if (nextRole && existing.role === "ADMIN") {
      // Demotion must not leave unlimited (null) quotas
      if (data.maxServers === undefined) {
        data.maxServers = Number.isFinite(config.defaultMaxServers)
          ? Math.max(0, config.defaultMaxServers)
          : 0;
      }
      if (data.maxMemoryMb === undefined) {
        data.maxMemoryMb = Number.isFinite(config.defaultMaxMemoryMb)
          ? Math.max(0, config.defaultMaxMemoryMb)
          : 0;
      }
      if (data.maxDatabases === undefined) {
        data.maxDatabases = Number.isFinite(config.defaultMaxDatabases)
          ? Math.max(0, config.defaultMaxDatabases)
          : 0;
      }
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
        databaseCount: user.servers.reduce(
          (sum, s) => sum + s._count.databases,
          0,
        ),
      });
    } catch {
      return reply.status(404).send({ error: "User not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/users/:id", async (request, reply) => {
    const me = await requireAdmin(request, reply);
    if (!me) return;
    if (me.id === request.params.id) {
      return reply.status(400).send({ error: "Cannot delete your own account" });
    }
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    const target = await prisma.user.findUnique({ where: { id: request.params.id } });
    if (!target) return reply.status(404).send({ error: "User not found" });
    if (target.role === "ADMIN" && admins <= 1) {
      return reply.status(400).send({ error: "Cannot delete the last admin" });
    }
    // Orphan their servers to the deleting admin
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
