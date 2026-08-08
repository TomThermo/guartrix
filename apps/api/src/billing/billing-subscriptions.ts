import { nanoid } from "nanoid";
import type { BillingSubscriptionRecord } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { toSubscriptionRecord } from "./billing-records.js";
import { emitBillingWebhook } from "./billing-webhook.js";
import { addMollieInterval, mollieCreateSubscription, toMollieDate } from "./mollie.js";

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * After a successful first payment on a recurring plan, create the Mollie
 * subscription (starts one interval later so the first charge is not doubled).
 */
export async function ensureMollieSubscriptionForPayment(paymentId: string): Promise<void> {
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
    console.warn(`[billing] cannot create subscription for ${paymentId}: no mollieCustomerId`);
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
  for (const server of servers) {
    if (
      server.status === "RUNNING" ||
      server.status === "STARTING" ||
      processManager.isRunning(server.id)
    ) {
      try {
        await processManager.stop(server.id);
        stopped.push(server.id);
      } catch (err) {
        console.warn(
          `[billing] stop after revoke failed for ${server.id}:`,
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
): Promise<BillingSubscriptionRecord> {
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
      await mollieCancelSubscription(row.user.mollieCustomerId, row.mollieSubscriptionId);
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
