import { nanoid } from "nanoid";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "@guartrix/shared";
import { toPlanRecord } from "../billing/billing.js";
import type { MolliePayment } from "../billing/mollie.js";
import {
  mapMollieStatus,
  mollieCheckoutUrl,
  mollieConfigured,
  mollieCreateCustomer,
  mollieCreatePayment,
} from "../billing/mollie.js";
import { errorMessage } from "../http-error.js";
import { panelBase, safeBillingRedirectUrl } from "../routes/billing/serialize.js";
import {
  createBillingSubscription,
  createPayment,
  findPlanTemplate,
} from "./billing.js";
import { findUser, updateUser } from "./users.js";

export type BillingCheckoutInput = {
  planSlug: string;
  redirectUrl?: string;
};

export type BillingCheckoutResult =
  | {
      payment: Awaited<ReturnType<typeof createPayment>>;
      checkoutUrl: string;
      activity: Record<string, unknown>;
    }
  | { error: string; status: number };

export async function createBillingCheckout(
  user: AuthUser,
  input: BillingCheckoutInput,
  _request: FastifyRequest,
): Promise<BillingCheckoutResult> {
  if (!mollieConfigured()) {
    return { error: "Mollie is not configured (set MOLLIE_API_KEY)", status: 503 };
  }
  if (user.role === "ADMIN") {
    return { error: "Admins already have unlimited quotas", status: 400 };
  }

  const plan = await findPlanTemplate({
    where: { slug: input.planSlug },
  });
  if (!plan || !plan.enabled) {
    return { error: "Plan not found", status: 404 };
  }
  if (plan.priceCents < 1) {
    return { error: "This plan has no price — ask an admin to grant it", status: 400 };
  }

  const paymentId = nanoid(16);
  const redirectUrl = safeBillingRedirectUrl(input.redirectUrl, paymentId);
  const webhookUrl = `${panelBase()}/api/public/billing/mollie`;

  let customerId: string | null = null;
  let localSubscriptionId: string | null = null;

  if (plan.recurringInterval) {
    try {
      const dbUser = await findUser({ where: { id: user.id } });
      customerId = dbUser?.mollieCustomerId ?? null;
      if (!customerId) {
        const customer = await mollieCreateCustomer({
          name: user.username,
          email: dbUser?.email ?? null,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await updateUser({
          where: { id: user.id },
          data: { mollieCustomerId: customerId },
        });
      }
      const sub = await createBillingSubscription({
        data: {
          id: nanoid(12),
          userId: user.id,
          planId: plan.id,
          interval: plan.recurringInterval,
          amountCents: plan.priceCents,
          currency: plan.currency,
          status: "pending",
          metadata: JSON.stringify({ planSlug: plan.slug }),
        },
      });
      localSubscriptionId = sub.id;
    } catch (err) {
      const message = errorMessage(err);
      return { error: `Mollie customer: ${message}`, status: 502 };
    }
  }

  let mollie: MolliePayment;
  try {
    mollie = await mollieCreatePayment({
      amountCents: plan.priceCents,
      currency: plan.currency,
      description: `Guartrix ${plan.name}`,
      redirectUrl,
      webhookUrl,
      metadata: {
        paymentId,
        userId: user.id,
        planSlug: plan.slug,
        ...(localSubscriptionId ? { localSubscriptionId } : {}),
      },
      ...(customerId
        ? {
            customerId,
            sequenceType: plan.recurringInterval ? ("first" as const) : undefined,
          }
        : {}),
    });
  } catch (err) {
    const message = errorMessage(err);
    return { error: `Mollie: ${message}`, status: 502 };
  }

  const checkoutUrl = mollieCheckoutUrl(mollie);
  if (!checkoutUrl) {
    return { error: "Mollie did not return a checkout URL", status: 502 };
  }

  const row = await createPayment({
    data: {
      id: paymentId,
      mollieId: mollie.id,
      userId: user.id,
      planId: plan.id,
      status: mapMollieStatus(mollie.status),
      amountCents: plan.priceCents,
      currency: plan.currency,
      description: `Guartrix ${plan.name}`,
      checkoutUrl,
      subscriptionId: localSubscriptionId,
      metadata: JSON.stringify({
        planSlug: plan.slug,
        recurring: Boolean(plan.recurringInterval),
      }),
    },
    include: { plan: true, user: { select: { username: true } } },
  });

  return {
    payment: row,
    checkoutUrl,
    activity: {
      paymentId: row.id,
      mollieId: mollie.id,
      planSlug: plan.slug,
      amountCents: plan.priceCents,
      recurring: Boolean(plan.recurringInterval),
    },
  };
}