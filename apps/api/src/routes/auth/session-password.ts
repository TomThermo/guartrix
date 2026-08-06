import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import {
  findUserByEmailInsensitive,
  hashPassword,
  hashResetToken,
  panelBaseUrl,
  passwordSchema,
} from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { destroySessionsForUser } from "../../auth/session-store.js";
import { prisma } from "../../db.js";
import { sendMail } from "../../mail.js";
import { checkLoginRate, clearLoginRate } from "./session.js";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export function registerSessionPasswordRoutes(app: FastifyInstance): void {
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
      return reply
        .status(400)
        .send({ error: "Reset link is invalid or expired" });
    }

    await prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { userId: row.userId },
    });
    await destroySessionsForUser(row.userId);
    await clearLoginRate(request);
    logActivity({ action: "auth.password-reset", request, user: row.user });

    return { ok: true, message: "Password updated. You can sign in now." };
  });
}
