import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
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
  TIMING_DUMMY_HASH,
  toAuthUser,
  verifyPassword,
} from "../../auth/auth.js";
import {
  configQuotaDefaults,
  usernameSchema,
} from "../../auth/user-quotas.js";
import { config } from "../../config.js";
import { assertSameOrigin, issueSessionCsrfToken } from "../../auth/csrf.js";
import { prisma } from "../../db.js";
import { isSmtpConfigured, sendMail } from "../../mail.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
} from "../../auth/password-policy.js";
import { getRateLimitStore } from "../../rate-limit-store.js";
import { linkPendingSubUsers } from "../../servers/server-access.js";
import { destroySessionsForUser } from "../../auth/session-store.js";
import { consumeRecoveryCode, verifyTotp } from "../../auth/totp.js";

const emailSchema = z.string().trim().email().max(254);

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
    const csrfToken = user
      ? issueSessionCsrfToken(request.session as { csrfToken?: string })
      : undefined;
    return { authenticated: Boolean(user), user, csrfToken };
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
      // Always run a verify (precomputed dummy when missing) to reduce timing leaks.
      const ok = verifyPassword(
        password,
        user ? user.passwordHash : TIMING_DUMMY_HASH,
      );
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
      const csrfToken = issueSessionCsrfToken(request.session as { csrfToken?: string });
      return { ok: true, user: sessionUser ?? toAuthUser(user), csrfToken };
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
      const csrfToken = issueSessionCsrfToken(request.session as { csrfToken?: string });
      return { ok: true, user: sessionUser ?? toAuthUser(user), csrfToken };
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
          ...configQuotaDefaults(),
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
    const csrfToken = issueSessionCsrfToken(request.session as { csrfToken?: string });
    return reply.status(201).send({
      ok: true,
      emailVerificationRequired: true,
      user: sessionUser ?? toAuthUser(user, {
        serverCount: 0,
        memoryUsedMb: 0,
        databaseCount: 0,
      }),
      csrfToken,
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
}
