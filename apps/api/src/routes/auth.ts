import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { UserRole } from "@msm/shared";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../activity-log.js";
import {
  ensureBootstrapAdmin,
  findUserByEmailInsensitive,
  findUserByUsernameInsensitive,
  getSessionUser,
  hashPassword,
  hashResetToken,
  needsRehash,
  panelBaseUrl,
  passwordSchema,
  requireAdmin,
  requireAuth,
  toAuthUser,
  verifyPassword,
} from "../auth/auth.js";
import { config } from "../config.js";
import { assertSameOrigin } from "../auth/csrf.js";
import { prisma } from "../db.js";
import {
  hostNodeName,
  hostPublicIp,
  hostTotalMemoryGb,
  hostTotalMemoryMb,
} from "../nodes/host-resources.js";
import { isSmtpConfigured, sendMail } from "../mail.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
} from "../auth/password-policy.js";
import { getRateLimitStore } from "../rate-limit-store.js";
import { linkPendingSubUsers } from "../servers/server-access.js";
import { destroySessionsForUser } from "../auth/session-store.js";
import { consumeRecoveryCode, verifyTotp } from "../auth/totp.js";

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

const LOGIN_RATE_WINDOW_MS = 15 * 60_000;
const LOGIN_RATE_MAX = 20;

function clientKey(request: FastifyRequest): string {
  return `login:${request.ip || "unknown"}`;
}

async function checkLoginRate(request: FastifyRequest): Promise<string | null> {
  const result = await getRateLimitStore().hit(
    clientKey(request),
    LOGIN_RATE_WINDOW_MS,
    LOGIN_RATE_MAX,
  );
  if (result.limited) {
    return "Too many login attempts. Try again in 15 minutes.";
  }
  return null;
}

async function clearLoginRate(request: FastifyRequest): Promise<void> {
  await getRateLimitStore().clear(clientKey(request));
}

/** When SMTP is live, non-admin accounts must verify email before a session. */
function emailVerificationBlocksLogin(user: {
  emailVerified: boolean;
  role: string;
}): boolean {
  return isSmtpConfigured() && !user.emailVerified && user.role !== "ADMIN";
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
    /** When SMTP is set, new accounts must verify email before login. */
    emailVerificationRequired: isSmtpConfigured(),
  }));

  app.post<{ Body: { username?: string; password?: string; rememberMe?: boolean } }>(
    "/api/auth/login",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });

      const limited = await checkLoginRate(request);
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

      if (needsRehash(user.passwordHash)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: hashPassword(password) },
        });
      }

      if (emailVerificationBlocksLogin(user)) {
        logActivity({
          action: "auth.login-failed",
          request,
          user,
          success: false,
          metadata: { username: user.username, reason: "email not verified" },
        });
        return reply.status(403).send({
          error:
            "Verify your email before signing in. Check your inbox for the link.",
          emailVerificationRequired: true,
        });
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

      await clearLoginRate(request);
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

      const limited = await checkLoginRate(request);
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

      if (emailVerificationBlocksLogin(user)) {
        await request.session.destroy().catch(() => undefined);
        logActivity({
          action: "auth.login-failed",
          request,
          user,
          success: false,
          metadata: {
            username: user.username,
            reason: "email not verified",
            twoFactor: true,
          },
        });
        return reply.status(403).send({
          error:
            "Verify your email before signing in. Check your inbox for the link.",
          emailVerificationRequired: true,
        });
      }

      const rememberMe = Boolean(request.session.pendingRememberMe);
      await clearLoginRate(request);
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

    const limited = await checkLoginRate(request);
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

    await clearLoginRate(request);
    logActivity({
      action: "auth.register",
      request,
      user,
      metadata: { email: emailNorm },
    });

    // With SMTP: require verify before a session (open registration safety).
    // Without SMTP: keep outbox-only UX — auto-login so operators aren't locked out.
    if (isSmtpConfigured()) {
      return reply.status(201).send({
        ok: true,
        emailVerificationRequired: true,
        message:
          "Account created. Check your email for a verification link before signing in.",
      });
    }

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

    const limited = await checkLoginRate(request);
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

    const limited = await checkLoginRate(request);
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
    await clearLoginRate(request);
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
      const { daemonGetSystem } = await import("../nodes/daemon-client.js");
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
