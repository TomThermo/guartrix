import type { FastifyRequest } from "fastify";
import type { AuthUser, UserRole } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { verifyAccountPassword } from "../auth/auth.js";
import { destroySessionsForUser } from "../auth/session-store.js";
import { assertNotLastAdmin } from "../auth/user-quotas.js";
import { prisma } from "../db.js";
import { ServiceError } from "./errors.js";

export async function exportAccountData(opts: {
  user: AuthUser;
  request: FastifyRequest;
}): Promise<{ filename: string; body: string }> {
  const { user, request } = opts;
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      email: true,
      emailVerified: true,
      displayName: true,
      phoneCountry: true,
      phoneNational: true,
      phoneE164: true,
      addressLine1: true,
      addressLine2: true,
      addressCity: true,
      addressPostalCode: true,
      addressCountry: true,
      addressLat: true,
      addressLon: true,
      addressVerifiedAt: true,
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
    throw new ServiceError(404, "User not found");
  }

  const [
    servers,
    activity,
    subusers,
    apiKeys,
    appPasswords,
    payments,
    subscriptions,
    pushSubscriptions,
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
    prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
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
    pushSubscriptions: pushSubscriptions.map((p) => ({
      id: p.id,
      endpoint: p.endpoint,
      userAgent: p.userAgent,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
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
  return { filename, body };
}

export async function deleteAccount(opts: {
  user: AuthUser;
  password: string;
  request: FastifyRequest;
}): Promise<{ ok: true }> {
  const { user: me, password, request } = opts;
  const row = await prisma.user.findUnique({ where: { id: me.id } });
  if (!row) throw new ServiceError(404, "User not found");

  if (!(await verifyAccountPassword(request, password))) {
    throw new ServiceError(401, "Invalid password");
  }

  const lastAdmin = await assertNotLastAdmin({
    role: row.role as UserRole,
    error: "Cannot delete the last admin account",
  });
  if (!lastAdmin.ok) {
    throw new ServiceError(400, lastAdmin.error);
  }

  const ownedCount = await prisma.server.count({ where: { ownerId: row.id } });
  if (ownedCount > 0) {
    const otherAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN", id: { not: row.id } },
      orderBy: { createdAt: "asc" },
    });
    if (!otherAdmin) {
      throw new ServiceError(400, "Delete or transfer your servers before deleting this account");
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

  return { ok: true };
}
