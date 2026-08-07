import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import {
  findUserByEmailInsensitive,
  findUserByUsernameInsensitive,
  getSessionUser,
  hashPassword,
  hashResetToken,
  panelBaseUrl,
  passwordSchema,
  toAuthUser,
} from "../../auth/auth.js";
import { assertSameOrigin, issueSessionCsrfToken } from "../../auth/csrf.js";
import { assertTurnstileToken } from "../../auth/turnstile.js";
import {
  configQuotaDefaults,
  usernameSchema,
} from "../../auth/user-quotas.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { isSmtpConfigured, sendMail } from "../../mail.js";
import { linkPendingSubUsers } from "../../servers/server-access.js";
import { checkLoginRate, clearLoginRate } from "./session.js";

const registerSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service" }),
  }),
  turnstileToken: z.string().optional(),
});

export function registerSessionRegisterRoutes(app: FastifyInstance): void {
  app.post("/api/auth/register", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    if (!config.registrationEnabled) {
      return reply.status(403).send({ error: "Registration is disabled" });
    }

    const limited = await checkLoginRate(request);
    if (limited) return reply.status(429).send({ error: limited });

    const botErr = await assertTurnstileToken(
      (request.body as { turnstileToken?: string } | null)?.turnstileToken,
      request.ip,
    );
    if (botErr) {
      return reply.status(400).send({ error: botErr });
    }

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
      user:
        sessionUser ??
        toAuthUser(user, {
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
      return reply
        .status(400)
        .send({ error: "Verification link is invalid or expired" });
    }

    await prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: true },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: row.userId },
    });
    await linkPendingSubUsers(row.userId, row.user.email);
    logActivity({ action: "auth.email-verified", request, user: row.user });

    return { ok: true, message: "Email verified." };
  });
}
