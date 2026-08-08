import { nanoid } from "nanoid";
import { logActivity } from "../activity-log.js";
import {
  emitBillingWebhook,
  provisionPaidPayment,
  revokePlanAfterFailedRenewal,
  toPaymentRecord,
} from "./billing.js";
import { prisma } from "../db.js";
import { mapMollieStatus, mollieGetPayment } from "./mollie.js";

/**
 * Pull the latest status for a Mollie payment and reconcile it with the local
 * `Payment` row: creates the row if missing (metadata fallback or subscription
 * renewal), updates status, provisions on first PAID, and revokes quotas on a
 * failed/canceled/expired renewal. Called both from the session "sync" route
 * (after checkout redirect) and the public Mollie webhook.
 */
export async function syncMolliePayment(mollieId: string) {
  const mollie = await mollieGetPayment(mollieId);
  const status = mapMollieStatus(mollie.status);

  let row = await prisma.payment.findUnique({
    where: { mollieId },
    include: { plan: true, user: { select: { username: true } } },
  });

  if (!row) {
    // Metadata fallback if payment was created outside panel
    const meta =
      mollie.metadata && typeof mollie.metadata === "object"
        ? (mollie.metadata as Record<string, string>)
        : {};
    if (meta.paymentId) {
      row = await prisma.payment.findUnique({
        where: { id: meta.paymentId },
        include: { plan: true, user: { select: { username: true } } },
      });
      if (row && !row.mollieId) {
        row = await prisma.payment.update({
          where: { id: row.id },
          data: { mollieId },
          include: { plan: true, user: { select: { username: true } } },
        });
      }
    }
  }

  // Subscription renewal: Mollie creates a new tr_ payment with subscriptionId
  if (!row && mollie.subscriptionId) {
    const localSub = await prisma.billingSubscription.findFirst({
      where: { mollieSubscriptionId: mollie.subscriptionId },
      include: { plan: true, user: true },
    });
    if (localSub) {
      row = await prisma.payment.create({
        data: {
          id: nanoid(16),
          mollieId,
          userId: localSub.userId,
          planId: localSub.planId,
          subscriptionId: localSub.id,
          status,
          amountCents:
            Math.round(Number(mollie.amount?.value || "0") * 100) || localSub.amountCents,
          currency: mollie.amount?.currency || localSub.currency,
          description: mollie.description || `Guartrix renewal`,
          metadata: JSON.stringify({
            renewal: true,
            mollieSubscriptionId: mollie.subscriptionId,
          }),
        },
        include: { plan: true, user: { select: { username: true } } },
      });
      if (localSub.status !== "active" && status === "PAID") {
        await prisma.billingSubscription.update({
          where: { id: localSub.id },
          data: { status: "active" },
        });
      }
    }
  }

  if (!row) {
    throw new Error(`Unknown Mollie payment ${mollieId}`);
  }

  const wasPaid = row.status === "PAID";
  row = await prisma.payment.update({
    where: { id: row.id },
    data: { status },
    include: { plan: true, user: { select: { username: true } } },
  });

  if (status === "PAID" && !wasPaid) {
    logActivity({
      action: "billing.paid",
      actor: "mollie",
      user: row.user
        ? { id: row.userId, username: row.user.username }
        : { id: row.userId, username: "user" },
      metadata: {
        paymentId: row.id,
        mollieId,
        planSlug: row.plan?.slug,
        amountCents: row.amountCents,
        renewal: Boolean(mollie.subscriptionId),
      },
    });
    await emitBillingWebhook("payment.paid", {
      payment: toPaymentRecord(row),
    });
  }

  if (status === "PAID" && !row.provisioned) {
    const result = await provisionPaidPayment(row.id);
    return result.payment;
  }

  if ((status === "FAILED" || status === "CANCELED" || status === "EXPIRED") && !wasPaid) {
    const meta = (() => {
      try {
        return row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();
    const isRenewal = Boolean(mollie.subscriptionId || meta.renewal);
    logActivity({
      action: "billing.failed",
      actor: "mollie",
      user: row.user
        ? { id: row.userId, username: row.user.username }
        : { id: row.userId, username: "user" },
      success: false,
      metadata: {
        paymentId: row.id,
        mollieId,
        status,
        renewal: isRenewal,
        subscriptionId: row.subscriptionId,
      },
    });
    if (isRenewal) {
      await revokePlanAfterFailedRenewal({
        userId: row.userId,
        paymentId: row.id,
        subscriptionId: row.subscriptionId,
        status,
      });
    }
  }

  return toPaymentRecord(row);
}
