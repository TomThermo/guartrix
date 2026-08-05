import { nanoid } from "nanoid";
import type { PlanTemplateRecord, PaymentRecord } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  addMollieInterval,
  mollieCreateSubscription,
  toMollieDate,
} from "./mollie.js";

export function toPlanRecord(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  maxServers: number;
  maxMemoryMb: number;
  maxDatabases: number;
  defaultMemoryMb: number;
  defaultDiskMb: number;
  autoCreateServer: boolean;
  defaultServerType: string;
  defaultMcVersion: string;
  recurringInterval: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PlanTemplateRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    maxServers: row.maxServers,
    maxMemoryMb: row.maxMemoryMb,
    maxDatabases: row.maxDatabases,
    defaultMemoryMb: row.defaultMemoryMb,
    defaultDiskMb: row.defaultDiskMb,
    autoCreateServer: row.autoCreateServer,
    defaultServerType: row.defaultServerType,
    defaultMcVersion: row.defaultMcVersion,
    recurringInterval: row.recurringInterval,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPaymentRecord(
  row: {
    id: string;
    mollieId: string | null;
    userId: string;
    planId: string | null;
    status: string;
    amountCents: number;
    currency: string;
    description: string;
    checkoutUrl: string | null;
    provisioned: boolean;
    provisionedAt: Date | null;
    subscriptionId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    user?: { username: string } | null;
    plan?: { slug: string; name: string } | null;
  },
): PaymentRecord {
  return {
    id: row.id,
    mollieId: row.mollieId,
    userId: row.userId,
    username: row.user?.username ?? null,
    planId: row.planId,
    planSlug: row.plan?.slug ?? null,
    planName: row.plan?.name ?? null,
    status: row.status as PaymentRecord["status"],
    amountCents: row.amountCents,
    currency: row.currency,
    description: row.description,
    checkoutUrl: row.checkoutUrl,
    provisioned: row.provisioned,
    provisionedAt: row.provisionedAt?.toISOString() ?? null,
    subscriptionId: row.subscriptionId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Apply plan quotas to a user (set to plan values). Admins stay unlimited.
 * Idempotent when called twice for the same payment via provisionPayment.
 */
export async function applyPlanToUser(
  userId: string,
  plan: {
    maxServers: number;
    maxMemoryMb: number;
    maxDatabases: number;
    slug: string;
    name: string;
  },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.role === "ADMIN") return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      maxServers: plan.maxServers,
      maxMemoryMb: plan.maxMemoryMb,
      maxDatabases: plan.maxDatabases,
    },
  });
}

async function pickFreePort(nodeId: string): Promise<number> {
  const freeAlloc = await prisma.allocation.findFirst({
    where: { nodeId, serverId: null, protocol: "tcp" },
    orderBy: { port: "asc" },
  });
  if (freeAlloc) return freeAlloc.port;

  const { processManager } = await import("../servers/process-manager.js");
  for (let port = 25565; port < 26000; port += 1) {
    if (await processManager.isPortFree(port, undefined, nodeId)) return port;
  }
  throw new Error("No free TCP port available on the selected node");
}

/**
 * Create a server from plan defaults after payment. Errors are stored on payment
 * metadata and do not roll back quota provisioning.
 */
export async function autoCreateServerForPayment(paymentId: string): Promise<{
  serverId?: string;
  error?: string;
}> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { plan: true, user: true },
  });
  if (!payment?.plan?.autoCreateServer) return {};
  if (!payment.user || payment.user.role === "ADMIN") return {};

  const plan = payment.plan;
  const meta = parseMetadata(payment.metadata);
  if (meta.renewal) return {};
  if (meta.autoServerId) {
    return { serverId: String(meta.autoServerId) };
  }
  if (meta.autoServerError) {
    return { error: String(meta.autoServerError) };
  }

  try {
    const { assertCanCreateServer } = await import("./quotas.js");
    await assertCanCreateServer(
      {
        id: payment.user.id,
        role: payment.user.role,
        maxServers: payment.user.maxServers,
        maxMemoryMb: payment.user.maxMemoryMb,
        maxDatabases: payment.user.maxDatabases,
      },
      plan.defaultMemoryMb,
      { diskMb: plan.defaultDiskMb },
    );

    const { assertNodeCapacity, resolveCreateNodeId } = await import("../nodes/nodes.js");
    const nodeId = await resolveCreateNodeId(undefined);
    await assertNodeCapacity(nodeId, plan.defaultMemoryMb);
    const port = await pickFreePort(nodeId);

    const type = (
      [
        "VANILLA",
        "PAPER",
        "FABRIC",
        "FORGE",
        "PURPUR",
        "NEOFORGE",
        "QUILT",
        "BEDROCK",
        "BEDROCK_PREVIEW",
        "POCKETMINE",
        "NUKKIT",
      ] as const
    ).includes(plan.defaultServerType as never)
      ? (plan.defaultServerType as import("@msm/shared").ServerType)
      : "PAPER";

    const id = nanoid(12);
    const name = `${plan.slug}-${id.slice(0, 6)}`;

    const { provisionPreparedServer } = await import("../servers/server-provision.js");
    await provisionPreparedServer({
      id,
      name,
      type,
      mcVersion: plan.defaultMcVersion || "1.21.1",
      port,
      memoryMb: plan.defaultMemoryMb,
      diskMb: plan.defaultDiskMb,
      cpuLimit: 0,
      ownerId: payment.userId,
      nodeId,
      cleanupOnFailure: true,
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        metadata: JSON.stringify({
          ...meta,
          autoServerId: id,
          autoServerPort: port,
        }),
      },
    });

    logActivity({
      action: "server.create",
      actor: "billing",
      user: { id: payment.userId, username: payment.user.username },
      serverId: id,
      serverName: name,
      metadata: {
        via: "billing-auto-create",
        paymentId,
        planSlug: plan.slug,
      },
    });

    return { serverId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        metadata: JSON.stringify({
          ...meta,
          autoServerError: message,
        }),
      },
    });
    console.error(`[billing] auto-create server failed for ${paymentId}:`, message);
    return { error: message };
  }
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * After a successful first payment on a recurring plan, create the Mollie
 * subscription (starts one interval later so the first charge is not doubled).
 */
export async function ensureMollieSubscriptionForPayment(
  paymentId: string,
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      plan: true,
      user: true,
      subscription: true,
    },
  });
  if (!payment?.plan?.recurringInterval || !payment.user) return;
  if (payment.subscription?.mollieSubscriptionId) return;

  const customerId = payment.user.mollieCustomerId;
  if (!customerId) {
    console.warn(
      `[billing] cannot create subscription for ${paymentId}: no mollieCustomerId`,
    );
    return;
  }

  const interval = payment.plan.recurringInterval;
  let localSub = payment.subscription;
  if (!localSub) {
    localSub = await prisma.billingSubscription.create({
      data: {
        id: nanoid(12),
        userId: payment.userId,
        planId: payment.planId,
        interval,
        amountCents: payment.plan.priceCents,
        currency: payment.plan.currency,
        status: "pending",
        metadata: JSON.stringify({ planSlug: payment.plan.slug }),
      },
    });
    await prisma.payment.update({
      where: { id: paymentId },
      data: { subscriptionId: localSub.id },
    });
  }

  const webhookUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/api/public/billing/mollie`;
  const startDate = toMollieDate(addMollieInterval(new Date(), interval));

  try {
    const sub = await mollieCreateSubscription({
      customerId,
      amountCents: payment.plan.priceCents,
      currency: payment.plan.currency,
      interval,
      description: `Guartrix ${payment.plan.name}`,
      webhookUrl,
      startDate,
      metadata: {
        localSubscriptionId: localSub.id,
        userId: payment.userId,
        planSlug: payment.plan.slug,
      },
    });
    await prisma.billingSubscription.update({
      where: { id: localSub.id },
      data: {
        mollieSubscriptionId: sub.id,
        status: sub.status === "active" ? "active" : "pending",
      },
    });
    logActivity({
      action: "billing.subscription-created",
      actor: "billing",
      user: { id: payment.userId, username: payment.user.username },
      metadata: {
        paymentId,
        subscriptionId: localSub.id,
        mollieSubscriptionId: sub.id,
        interval,
      },
    });
    await emitBillingWebhook("subscription.created", {
      subscriptionId: localSub.id,
      mollieSubscriptionId: sub.id,
      userId: payment.userId,
      planSlug: payment.plan.slug,
      interval,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[billing] create subscription failed for ${paymentId}:`, message);
    await prisma.billingSubscription.update({
      where: { id: localSub.id },
      data: {
        status: "suspended",
        metadata: JSON.stringify({
          ...parseMetadata(localSub.metadata),
          error: message,
        }),
      },
    });
  }
}

/**
 * Mark payment paid + apply plan once. Safe under concurrent webhooks.
 */
export async function provisionPaidPayment(paymentId: string): Promise<{
  already: boolean;
  payment: PaymentRecord;
}> {
  const existing = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      plan: true,
      user: { select: { username: true, role: true } },
    },
  });
  if (!existing) throw new Error("Payment not found");
  if (existing.provisioned) {
    return { already: true, payment: toPaymentRecord(existing) };
  }
  if (existing.status !== "PAID") {
    throw new Error("Payment is not paid");
  }
  if (!existing.plan) {
    throw new Error("Payment has no plan");
  }

  if (existing.user?.role !== "ADMIN") {
    await applyPlanToUser(existing.userId, existing.plan);
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      provisioned: true,
      provisionedAt: new Date(),
    },
    include: { plan: true, user: { select: { username: true } } },
  });

  const auto = await autoCreateServerForPayment(paymentId);
  await ensureMollieSubscriptionForPayment(paymentId);

  logActivity({
    action: "billing.provisioned",
    actor: "billing",
    user: updated.user
      ? { id: updated.userId, username: updated.user.username }
      : { id: updated.userId, username: "user" },
    metadata: {
      paymentId: updated.id,
      mollieId: updated.mollieId,
      planSlug: updated.plan?.slug,
      maxServers: updated.plan?.maxServers,
      maxMemoryMb: updated.plan?.maxMemoryMb,
      maxDatabases: updated.plan?.maxDatabases,
      ...(auto.serverId ? { autoServerId: auto.serverId } : {}),
      ...(auto.error ? { autoServerError: auto.error } : {}),
    },
  });

  await emitBillingWebhook("payment.provisioned", {
    payment: toPaymentRecord(updated),
    plan: updated.plan ? toPlanRecord(updated.plan) : null,
    ...(auto.serverId ? { autoServerId: auto.serverId } : {}),
    ...(auto.error ? { autoServerError: auto.error } : {}),
  });

  return { already: false, payment: toPaymentRecord(updated) };
}

export function toSubscriptionRecord(row: {
  id: string;
  planId: string | null;
  interval: string;
  amountCents: number;
  currency: string;
  status: string;
  mollieSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  canceledAt: Date | null;
  plan?: { slug: string; name: string } | null;
}): import("@msm/shared").BillingSubscriptionRecord {
  return {
    id: row.id,
    planId: row.planId,
    planSlug: row.plan?.slug ?? null,
    planName: row.plan?.name ?? null,
    interval: row.interval,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    mollieSubscriptionId: row.mollieSubscriptionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canceledAt: row.canceledAt?.toISOString() ?? null,
  };
}

/**
 * After a failed/expired/canceled renewal, drop quotas to panel defaults and
 * stop running servers so unpaid capacity does not linger.
 */
export async function revokePlanAfterFailedRenewal(opts: {
  userId: string;
  paymentId: string;
  subscriptionId?: string | null;
  status: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user || user.role === "ADMIN") return;

  await prisma.user.update({
    where: { id: opts.userId },
    data: {
      maxServers: config.defaultMaxServers,
      maxMemoryMb: config.defaultMaxMemoryMb,
      maxDatabases: config.defaultMaxDatabases,
    },
  });

  if (opts.subscriptionId) {
    await prisma.billingSubscription.updateMany({
      where: {
        id: opts.subscriptionId,
        status: { in: ["pending", "active"] },
      },
      data: { status: "suspended" },
    });
  }

  const servers = await prisma.server.findMany({
    where: { ownerId: opts.userId },
    select: { id: true, name: true, status: true },
  });
  const { processManager } = await import("../servers/process-manager.js");
  const stopped: string[] = [];
  for (const s of servers) {
    if (
      s.status === "RUNNING" ||
      s.status === "STARTING" ||
      processManager.isRunning(s.id)
    ) {
      try {
        await processManager.stop(s.id);
        stopped.push(s.id);
      } catch (err) {
        console.warn(
          `[billing] stop after revoke failed for ${s.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  logActivity({
    action: "billing.revoked",
    actor: "billing",
    user: { id: user.id, username: user.username },
    success: false,
    metadata: {
      paymentId: opts.paymentId,
      subscriptionId: opts.subscriptionId ?? null,
      status: opts.status,
      maxServers: config.defaultMaxServers,
      maxMemoryMb: config.defaultMaxMemoryMb,
      maxDatabases: config.defaultMaxDatabases,
      stoppedServerIds: stopped,
    },
  });

  await emitBillingWebhook("subscription.revoked", {
    userId: opts.userId,
    paymentId: opts.paymentId,
    subscriptionId: opts.subscriptionId ?? null,
    status: opts.status,
    stoppedServerIds: stopped,
  });
}

/** Cancel a Mollie subscription + mark local row canceled (no quota revoke). */
export async function cancelBillingSubscription(
  subscriptionId: string,
  actor: { id: string; username: string },
): Promise<import("@msm/shared").BillingSubscriptionRecord> {
  const row = await prisma.billingSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      user: { select: { id: true, username: true, mollieCustomerId: true } },
    },
  });
  if (!row) throw new Error("Subscription not found");
  if (row.status === "canceled") {
    return toSubscriptionRecord(row);
  }

  if (row.mollieSubscriptionId && row.user.mollieCustomerId) {
    const { mollieCancelSubscription } = await import("./mollie.js");
    try {
      await mollieCancelSubscription(
        row.user.mollieCustomerId,
        row.mollieSubscriptionId,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Already canceled at Mollie is fine
      if (!/404|not found|canceled/i.test(message)) {
        throw new Error(`Mollie cancel failed: ${message}`);
      }
    }
  }

  const updated = await prisma.billingSubscription.update({
    where: { id: row.id },
    data: { status: "canceled", canceledAt: new Date() },
    include: { plan: true },
  });

  logActivity({
    action: "billing.subscription-canceled",
    user: actor,
    metadata: {
      subscriptionId: updated.id,
      mollieSubscriptionId: updated.mollieSubscriptionId,
      planSlug: updated.plan?.slug,
    },
  });
  await emitBillingWebhook("subscription.canceled", {
    subscription: toSubscriptionRecord(updated),
  });
  return toSubscriptionRecord(updated);
}

/** Optional outbound webhook for external billing panels (JSON POST). */
export async function emitBillingWebhook(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.BILLING_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "guartrix",
          event,
          panel: config.publicBaseUrl,
          ...payload,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[billing] webhook ${event} → ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(
      `[billing] webhook ${event} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}
