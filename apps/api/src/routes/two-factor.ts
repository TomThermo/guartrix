import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../activity-log.js";
import { getSessionUser, requireAuth, verifyPassword } from "../auth.js";
import { assertSameOrigin } from "../csrf.js";
import { prisma } from "../db.js";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  sealTotpSecret,
  verifyTotp,
} from "../totp.js";

const codeSchema = z.object({
  code: z.string().min(6).max(64),
});

const disableSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().min(6).max(64),
});

const regenerateSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().min(6).max(64),
});

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths still allowed while a required-role user has not enrolled yet. */
function twoFactorExemptPath(pathname: string): boolean {
  if (pathname === "/api/health" || pathname === "/api/ready") return true;
  if (pathname === "/api/metrics" || pathname === "/metrics") return true;
  if (pathname.startsWith("/api/internal/")) return true;
  if (pathname.startsWith("/api/public/")) return true;
  if (pathname === "/api/auth/me") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/api/auth/config") return true;
  if (pathname.startsWith("/api/auth/2fa")) return true;
  return false;
}

/**
 * When TWO_FACTOR_REQUIRED_ROLES includes the user's role and they have not
 * enrolled yet, block mutating API calls so the only way forward is setup.
 */
export function registerTwoFactorGuard(app: FastifyInstance): void {
  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0] ?? "";
    if (!pathOnly.startsWith("/api/")) return;
    if (twoFactorExemptPath(pathOnly)) return;
    const auth = request.headers.authorization;
    if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
      // API keys skip per-request TOTP codes, but required roles must still
      // have enrolled 2FA before keys can mutate (checked in resolveApiKeyAuth
      // + key mint). Cookie sessions keep the enrollment gate below.
      return;
    }
    // Reads never require 2FA — skip user load on GET/HEAD/OPTIONS.
    if (!MUTATING.has(request.method)) return;

    const user = await getSessionUser(request);
    if (!user) return;
    if (!user.twoFactorRequired || user.twoFactorEnabled) return;

    return reply.status(403).send({
      error:
        "Two-factor authentication is required for your role. Enable it under Account → Security.",
      code: "TWO_FACTOR_REQUIRED",
    });
  });
}

/**
 * Self-service TOTP enrolment. Secret stays pending (totpEnabled=false) until
 * the user confirms a valid code — so a half-finished setup never locks them out.
 */
export function registerTwoFactorRoutes(app: FastifyInstance): void {
  app.get("/api/auth/2fa", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    if (!row) return reply.status(401).send({ error: "Unauthorized" });
    const recoveryLeft = row.totpRecoveryCodes
      ? (() => {
          try {
            const parsed = JSON.parse(row.totpRecoveryCodes) as unknown;
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            return 0;
          }
        })()
      : 0;
    return {
      enabled: row.totpEnabled,
      required: user.twoFactorRequired === true,
      pendingSetup: Boolean(row.totpSecret && !row.totpEnabled),
      recoveryCodesRemaining: row.totpEnabled ? recoveryLeft : 0,
    };
  });

  app.post("/api/auth/2fa/setup", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAuth(request, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    if (!row) return reply.status(401).send({ error: "Unauthorized" });
    if (row.totpEnabled) {
      return reply
        .status(400)
        .send({ error: "Two-factor authentication is already enabled" });
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: row.id },
      data: {
        totpSecret: sealTotpSecret(secret),
        totpEnabled: false,
        totpRecoveryCodes: null,
      },
    });

    const url = otpauthUrl(row.username, secret);
    return {
      secret,
      otpauthUrl: url,
      secretGrouped: secret.match(/.{1,4}/g)?.join(" ") ?? secret,
    };
  });

  app.post<{ Body: { code?: string } }>(
    "/api/auth/2fa/enable",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireAuth(request, reply);
      if (!user) return;
      const parsed = codeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "A 6-digit authenticator code is required" });
      }

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      if (!row) return reply.status(401).send({ error: "Unauthorized" });
      if (row.totpEnabled) {
        return reply
          .status(400)
          .send({ error: "Two-factor authentication is already enabled" });
      }
      if (!row.totpSecret) {
        return reply
          .status(400)
          .send({ error: "Start setup first (enter the secret into your app)" });
      }
      if (!verifyTotp(row.totpSecret, parsed.data.code)) {
        return reply.status(401).send({ error: "Invalid authenticator code" });
      }

      const recovery = generateRecoveryCodes(8);
      await prisma.user.update({
        where: { id: row.id },
        data: {
          totpEnabled: true,
          totpRecoveryCodes: JSON.stringify(recovery.hashes),
        },
      });

      logActivity({ action: "auth.2fa-enabled", request, user });

      return { ok: true, recoveryCodes: recovery.plain };
    },
  );

  app.post<{ Body: { password?: string; code?: string } }>(
    "/api/auth/2fa/disable",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireAuth(request, reply);
      if (!user) return;
      const parsed = disableSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Password and authenticator code are required" });
      }

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      if (!row) return reply.status(401).send({ error: "Unauthorized" });
      if (!row.totpEnabled || !row.totpSecret) {
        return reply
          .status(400)
          .send({ error: "Two-factor authentication is not enabled" });
      }
      if (user.twoFactorRequired) {
        return reply.status(400).send({
          error:
            "Your role requires two-factor authentication — ask an admin to change the policy first",
        });
      }
      if (!verifyPassword(parsed.data.password, row.passwordHash)) {
        return reply.status(401).send({ error: "Invalid password" });
      }
      if (!verifyTotp(row.totpSecret, parsed.data.code)) {
        return reply.status(401).send({ error: "Invalid authenticator code" });
      }

      await prisma.user.update({
        where: { id: row.id },
        data: {
          totpSecret: null,
          totpEnabled: false,
          totpRecoveryCodes: null,
        },
      });

      logActivity({ action: "auth.2fa-disabled", request, user });
      return { ok: true };
    },
  );

  app.post("/api/auth/2fa/cancel", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAuth(request, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    if (!row) return reply.status(401).send({ error: "Unauthorized" });
    if (row.totpEnabled) {
      return reply
        .status(400)
        .send({ error: "Two-factor authentication is already enabled" });
    }
    await prisma.user.update({
      where: { id: row.id },
      data: { totpSecret: null, totpRecoveryCodes: null },
    });
    return { ok: true };
  });

  app.post<{ Body: { password?: string; code?: string } }>(
    "/api/auth/2fa/recovery",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireAuth(request, reply);
      if (!user) return;
      const parsed = regenerateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: "Password and authenticator code are required" });
      }

      const row = await prisma.user.findUnique({ where: { id: user.id } });
      if (!row) return reply.status(401).send({ error: "Unauthorized" });
      if (!row.totpEnabled || !row.totpSecret) {
        return reply
          .status(400)
          .send({ error: "Two-factor authentication is not enabled" });
      }
      if (!verifyPassword(parsed.data.password, row.passwordHash)) {
        return reply.status(401).send({ error: "Invalid password" });
      }
      if (!verifyTotp(row.totpSecret, parsed.data.code)) {
        return reply.status(401).send({ error: "Invalid authenticator code" });
      }

      const recovery = generateRecoveryCodes(8);
      await prisma.user.update({
        where: { id: row.id },
        data: { totpRecoveryCodes: JSON.stringify(recovery.hashes) },
      });

      logActivity({
        action: "auth.2fa-recovery-regenerated",
        request,
        user,
      });

      return { ok: true, recoveryCodes: recovery.plain };
    },
  );
}
