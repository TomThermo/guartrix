import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../activity-log.js";
import { requireSessionAuth } from "../auth.js";
import { assertSameOrigin } from "../csrf.js";
import { prisma } from "../db.js";

const APP_PASSWORD_MAX = 10;
const TOKEN_PREFIX = "gtap_";

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function generateToken(): { token: string; prefix: string; tokenHash: string } {
  const body = randomBytes(24).toString("base64url");
  const token = `${TOKEN_PREFIX}${body}`;
  return {
    token,
    prefix: token.slice(0, 12),
    tokenHash: hashToken(token),
  };
}

export function verifyAppPasswordToken(
  password: string,
  tokenHash: string,
): boolean {
  const next = Buffer.from(hashToken(password), "hex");
  const prev = Buffer.from(tokenHash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

/** True if password matches any active app-password for this user. */
export async function verifyUserAppPassword(
  userId: string,
  password: string,
): Promise<boolean> {
  if (!password.startsWith(TOKEN_PREFIX)) return false;
  const tokenHash = hashToken(password);
  const row = await prisma.appPassword.findUnique({ where: { tokenHash } });
  if (!row || row.userId !== userId || row.revokedAt) return false;
  void prisma.appPassword
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return true;
}

function toRecord(row: {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export function registerAppPasswordRoutes(app: FastifyInstance): void {
  app.get("/api/account/app-passwords", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;
    const rows = await prisma.appPassword.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return { passwords: rows.map(toRecord), max: APP_PASSWORD_MAX };
  });

  app.post("/api/account/app-passwords", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const parsed = z
      .object({ name: z.string().trim().min(1).max(64) })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const active = await prisma.appPassword.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (active >= APP_PASSWORD_MAX) {
      return reply.status(400).send({
        error: `At most ${APP_PASSWORD_MAX} active app passwords`,
      });
    }

    const { token, prefix, tokenHash } = generateToken();
    const row = await prisma.appPassword.create({
      data: {
        id: nanoid(12),
        userId: user.id,
        name: parsed.data.name,
        prefix,
        tokenHash,
      },
    });
    logActivity({
      action: "app-password.create",
      request,
      user,
      metadata: { id: row.id, name: row.name, prefix },
    });
    return reply.status(201).send({ password: toRecord(row), token });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/account/app-passwords/:id",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireSessionAuth(request, reply);
      if (!user) return;

      const row = await prisma.appPassword.findFirst({
        where: { id: request.params.id, userId: user.id },
      });
      if (!row) return reply.status(404).send({ error: "Not found" });
      if (row.revokedAt) {
        return reply.status(400).send({ error: "Already revoked" });
      }
      const updated = await prisma.appPassword.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      logActivity({
        action: "app-password.revoke",
        request,
        user,
        metadata: { id: row.id, name: row.name, prefix: row.prefix },
      });
      return { password: toRecord(updated) };
    },
  );
}
