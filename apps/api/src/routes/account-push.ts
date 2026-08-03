import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { assertSameOrigin } from "../csrf.js";
import { prisma } from "../db.js";
import { getVapidPublicKey, isWebPushConfigured } from "../web-push.js";

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
  userAgent: z.string().max(512).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

/**
 * Opt-in Web Push subscriptions for critical alerts (crash / disk / …).
 */
export function registerAccountPushRoutes(app: FastifyInstance): void {
  app.get("/api/account/push/status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const publicKey = getVapidPublicKey();
    const count = await prisma.pushSubscription.count({
      where: { userId: user.id },
    });
    return {
      configured: isWebPushConfigured(),
      publicKey,
      subscriptionCount: count,
    };
  });

  app.get("/api/account/push/subscriptions", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const rows = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      subscriptions: rows.map((r) => ({
        id: r.id,
        endpoint: r.endpoint,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });

  app.post("/api/account/push/subscribe", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!isWebPushConfigured()) {
      return reply.status(503).send({
        error: "Web Push is not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).",
      });
    }

    const parsed = subscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid subscription" });
    }

    const ua =
      parsed.data.userAgent?.trim() ||
      (typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"].slice(0, 512)
        : null);

    const hash = endpointHash(parsed.data.endpoint);
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpointHash: hash },
    });
    if (existing && existing.userId !== user.id) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: user.id,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: ua,
        },
      });
    } else if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: ua,
        },
      });
    } else {
      await prisma.pushSubscription.create({
        data: {
          id: nanoid(12),
          userId: user.id,
          endpoint: parsed.data.endpoint,
          endpointHash: hash,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: ua,
        },
      });
    }

    return { ok: true };
  });

  app.delete("/api/account/push/subscribe", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parsed = unsubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid endpoint" });
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        userId: user.id,
        endpointHash: endpointHash(parsed.data.endpoint),
      },
    });
    return { ok: true };
  });

  app.delete("/api/account/push/subscriptions", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireAuth(request, reply);
    if (!user) return;

    const result = await prisma.pushSubscription.deleteMany({
      where: { userId: user.id },
    });
    return { ok: true, deleted: result.count };
  });
}
