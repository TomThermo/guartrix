import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../activity-log.js";
import { requireAuth, verifyPassword } from "../auth.js";
import { assertSameOrigin } from "../csrf.js";
import { prisma } from "../db.js";
import { destroySessionsForUser } from "../session-store.js";

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
  confirm: z.literal("DELETE"),
});

/**
 * GDPR self-service: export personal data + delete account.
 */
export function registerAccountGdprRoutes(app: FastifyInstance): void {
  app.get("/api/account/export", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        role: true,
        maxServers: true,
        maxMemoryMb: true,
        maxDatabases: true,
        totpEnabled: true,
        mollieCustomerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!full) {
      return reply.status(404).send({ error: "User not found" });
    }

    const [
      servers,
      activity,
      subusers,
      apiKeys,
      appPasswords,
      payments,
      subscriptions,
    ] = await Promise.all([
      prisma.server.findMany({
        where: { ownerId: user.id },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.activityEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          action: true,
          category: true,
          serverId: true,
          serverName: true,
          actorName: true,
          actorIp: true,
          success: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.subUser.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          serverId: true,
          email: true,
          permissions: true,
          createdAt: true,
          updatedAt: true,
          server: { select: { name: true } },
        },
      }),
      prisma.apiKey.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          prefix: true,
          permissions: true,
          serverIds: true,
          lastUsedAt: true,
          createdAt: true,
          revokedAt: true,
        },
      }),
      prisma.appPassword.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          prefix: true,
          lastUsedAt: true,
          createdAt: true,
          revokedAt: true,
        },
      }),
      prisma.payment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          mollieId: true,
          planId: true,
          status: true,
          amountCents: true,
          currency: true,
          description: true,
          provisioned: true,
          provisionedAt: true,
          subscriptionId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.billingSubscription.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          planId: true,
          mollieSubscriptionId: true,
          interval: true,
          amountCents: true,
          currency: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          canceledAt: true,
        },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: full.id,
        username: full.username,
        email: full.email,
        emailVerified: full.emailVerified,
        role: full.role,
        maxServers: full.maxServers,
        maxMemoryMb: full.maxMemoryMb,
        maxDatabases: full.maxDatabases,
        totpEnabled: full.totpEnabled,
        mollieCustomerId: full.mollieCustomerId,
        createdAt: full.createdAt.toISOString(),
        updatedAt: full.updatedAt.toISOString(),
      },
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      activity: activity.map((e) => ({
        id: e.id,
        action: e.action,
        category: e.category,
        serverId: e.serverId,
        serverName: e.serverName,
        actorName: e.actorName,
        actorIp: e.actorIp,
        success: e.success,
        createdAt: e.createdAt.toISOString(),
        metadata: e.metadata
          ? (() => {
              try {
                return JSON.parse(e.metadata!) as unknown;
              } catch {
                return e.metadata;
              }
            })()
          : null,
      })),
      subusers: subusers.map((s) => ({
        id: s.id,
        serverId: s.serverId,
        serverName: s.server.name,
        email: s.email,
        permissions: (() => {
          try {
            return JSON.parse(s.permissions) as unknown;
          } catch {
            return s.permissions;
          }
        })(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      apiKeys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        permissions: (() => {
          try {
            return JSON.parse(k.permissions) as unknown;
          } catch {
            return k.permissions;
          }
        })(),
        serverIds: k.serverIds
          ? (() => {
              try {
                return JSON.parse(k.serverIds!) as unknown;
              } catch {
                return k.serverIds;
              }
            })()
          : null,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
        revokedAt: k.revokedAt?.toISOString() ?? null,
      })),
      appPasswords: appPasswords.map((p) => ({
        id: p.id,
        name: p.name,
        prefix: p.prefix,
        lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        revokedAt: p.revokedAt?.toISOString() ?? null,
      })),
      billing: {
        payments: payments.map((p) => ({
          id: p.id,
          mollieId: p.mollieId,
          planId: p.planId,
          status: p.status,
          amountCents: p.amountCents,
          currency: p.currency,
          description: p.description,
          provisioned: p.provisioned,
          provisionedAt: p.provisionedAt?.toISOString() ?? null,
          subscriptionId: p.subscriptionId,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          planId: s.planId,
          mollieSubscriptionId: s.mollieSubscriptionId,
          interval: s.interval,
          amountCents: s.amountCents,
          currency: s.currency,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          canceledAt: s.canceledAt?.toISOString() ?? null,
        })),
      },
    };

    logActivity({
      action: "account.export",
      request,
      user,
    });

    const body = JSON.stringify(payload, null, 2);
    const filename = `guartrix-account-${full.username}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(body);
  });

  app.delete("/api/account", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const me = await requireAuth(request, reply);
    if (!me) return;

    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Provide password and confirm: "DELETE"',
      });
    }

    const row = await prisma.user.findUnique({ where: { id: me.id } });
    if (!row) return reply.status(404).send({ error: "User not found" });

    if (!verifyPassword(parsed.data.password, row.passwordHash)) {
      return reply.status(401).send({ error: "Invalid password" });
    }

    if (row.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN" } });
      if (admins <= 1) {
        return reply
          .status(400)
          .send({ error: "Cannot delete the last admin account" });
      }
    }

    const ownedCount = await prisma.server.count({ where: { ownerId: row.id } });
    if (ownedCount > 0) {
      const otherAdmin = await prisma.user.findFirst({
        where: { role: "ADMIN", id: { not: row.id } },
        orderBy: { createdAt: "asc" },
      });
      if (!otherAdmin) {
        return reply.status(400).send({
          error:
            "Delete or transfer your servers before deleting this account",
        });
      }
      await prisma.server.updateMany({
        where: { ownerId: row.id },
        data: { ownerId: otherAdmin.id },
      });
    }

    logActivity({
      action: "account.delete",
      request,
      user: me,
      metadata: { username: row.username, role: row.role },
    });

    await destroySessionsForUser(row.id);
    await prisma.user.delete({ where: { id: row.id } });

    try {
      await request.session.destroy();
    } catch {
      // already gone
    }

    return { ok: true };
  });
}
