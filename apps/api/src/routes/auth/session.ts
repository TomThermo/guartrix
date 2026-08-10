import type { FastifyInstance, FastifyRequest } from "fastify";
import { logActivity } from "../../activity-log.js";
import {
  ensureBootstrapAdmin,
  findUserByUsernameInsensitive,
  getSessionUser,
  hashPassword,
  needsRehash,
  TIMING_DUMMY_HASH,
  toAuthUser,
  verifyPassword,
} from "../../auth/auth.js";
import { config } from "../../config.js";
import { assertSameOrigin, ensureSessionCsrfToken } from "../../auth/csrf.js";
import { assertTurnstileToken, turnstilePublicConfig } from "../../auth/turnstile.js";
import { isSmtpConfigured } from "../../mail.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
} from "../../auth/password-policy.js";
import { getRateLimitStore } from "../../rate-limit-store.js";
import { linkPendingSubUsers } from "../../servers/server-access.js";
import { consumeRecoveryCode, verifyTotp } from "../../auth/totp.js";
import { registerSessionPasswordRoutes } from "./session-password.js";
import { registerSessionRegisterRoutes } from "./session-register.js";
import { findUser, updateUser } from "../../services/users.js";

const LOGIN_RATE_WINDOW_MS = 15 * 60_000;
const LOGIN_RATE_MAX = 20;

function clientKey(request: FastifyRequest): string {
  return `login:${request.ip || "unknown"}`;
}

export async function checkLoginRate(request: FastifyRequest): Promise<string | null> {
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

export async function clearLoginRate(request: FastifyRequest): Promise<void> {
  await getRateLimitStore().clear(clientKey(request));
}

/** When SMTP is live, non-admin accounts must verify email before a session. */
function emailVerificationBlocksLogin(user: { emailVerified: boolean; role: string }): boolean {
  return isSmtpConfigured() && !user.emailVerified && user.role !== "ADMIN";
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/api/auth/me", async (request) => {
    const user = await getSessionUser(request);
    const csrfToken = user ? await ensureSessionCsrfToken(request) : undefined;
    return { authenticated: Boolean(user), user, csrfToken };
  });

  app.get("/api/auth/config", async () => ({
    registrationEnabled: config.registrationEnabled,
    passwordMinLength: PASSWORD_MIN_LENGTH,
    passwordPolicy: passwordPolicyMessage(),
    /** When SMTP is set, new accounts must verify email before login. */
    emailVerificationRequired: isSmtpConfigured(),
    ...turnstilePublicConfig(),
  }));

  app.post<{
    Body: {
      username?: string;
      password?: string;
      rememberMe?: boolean;
      turnstileToken?: string;
    };
  }>("/api/auth/login", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const limited = await checkLoginRate(request);
    if (limited) {
      return reply.status(429).send({ error: limited });
    }

    const botErr = await assertTurnstileToken(request.body?.turnstileToken, request.ip);
    if (botErr) {
      return reply.status(400).send({ error: botErr });
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
    const ok = verifyPassword(password, user ? user.passwordHash : TIMING_DUMMY_HASH);
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
      await updateUser({
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
        error: "Verify your email before signing in. Check your inbox for the link.",
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
      // regenerate() persists an empty session first; @fastify/session may skip the
      // end-of-request save when cookie.secure && protocol!==https (HTTP→API proxy).
      // Explicit save keeps pendingTwoFactorUserId so /login/2fa can find it.
      await request.session.save();
      return { ok: true, requiresTwoFactor: true };
    }

    await clearLoginRate(request);
    await request.session.regenerate();
    request.session.authenticated = true;
    request.session.userId = user.id;
    request.session.rememberMe = rememberMe;

    // Remember me: 30 days. Otherwise: 1 day (still restored after API restart via file store).
    request.session.cookie.maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
    await request.session.save();

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
    const csrfToken = await ensureSessionCsrfToken(request);
    return { ok: true, user: sessionUser ?? toAuthUser(user), csrfToken };
  });

  app.post<{ Body: { code?: string } }>("/api/auth/login/2fa", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const limited = await checkLoginRate(request);
    if (limited) {
      return reply.status(429).send({ error: limited });
    }

    const pendingUserId = request.session.pendingTwoFactorUserId;
    if (!pendingUserId) {
      return reply.status(401).send({ error: "Sign in with your password first" });
    }
    const user = await findUser({ where: { id: pendingUserId } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      await request.session.destroy().catch(() => undefined);
      return reply.status(401).send({ error: "Sign in with your password first" });
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
      await updateUser({
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
        error: "Verify your email before signing in. Check your inbox for the link.",
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
    request.session.cookie.maxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
    await request.session.save();

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
    const csrfToken = await ensureSessionCsrfToken(request);
    return { ok: true, user: sessionUser ?? toAuthUser(user), csrfToken };
  });

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
  registerSessionRegisterRoutes(app);
  registerSessionPasswordRoutes(app);
}
