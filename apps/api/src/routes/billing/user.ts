import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import {
  cancelBillingSubscription,
  toPaymentRecord,
  toPlanRecord,
  toSubscriptionRecord,
} from "../../billing/billing.js";
import type { MolliePayment } from "../../billing/mollie.js";
import { syncMolliePayment } from "../../billing/billing-mollie-sync.js";
import { requireAuth, requireSessionAuth } from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { getRateLimitStore } from "../../rate-limit-store.js";
import { errorMessage, sendZodError } from "../../http-error.js";
import {
  mapMollieStatus,
  mollieCheckoutUrl,
  mollieConfigured,
  mollieCreateCustomer,
  mollieCreatePayment,
  mollieTestMode,
} from "../../billing/mollie.js";
import {
  createBillingSubscription,
  createPayment,
  findBillingSubscription,
  findFirstBillingSubscription,
  findManyBillingSubscriptions,
  findManyPayments,
  findManyPlanTemplates,
  findPayment,
  findPlanTemplate,
} from "../../repositories/billing.js";
import { findUser, updateUser } from "../../repositories/users.js";
import {
  MOLLIE_WEBHOOK_MAX,
  MOLLIE_WEBHOOK_WINDOW_MS,
  mollieWebhookIpAllowed,
  panelBase,
  safeBillingRedirectUrl,
} from "./serialize.js";

export function registerBillingUserRoutes(app: FastifyInstance): void {
  // --- Mollie status (session) ---
  app.get("/api/billing/mollie-status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return {
      configured: mollieConfigured(),
      testMode: mollieConfigured() ? mollieTestMode() : false,
    };
  });

  // --- Public plans (enabled only) ---
  app.get("/api/billing/plans", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const rows = await findManyPlanTemplates({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

  // --- Own payments ---
  app.get("/api/billing/payments", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;
    const rows = await findManyPayments({
      where: { userId: user.id },
      include: { plan: true, user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { payments: rows.map(toPaymentRecord) };
  });

  // --- Own subscriptions ---
  app.get("/api/billing/subscriptions", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;
    const rows = await findManyBillingSubscriptions({
      where: { userId: user.id },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { subscriptions: rows.map(toSubscriptionRecord) };
  });

  app.post<{ Params: { id: string } }>(
    "/api/billing/subscriptions/:id/cancel",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireSessionAuth(request, reply);
      if (!user) return;
      const row = await findFirstBillingSubscription({
        where: {
          id: request.params.id,
          ...(user.role === "ADMIN" ? {} : { userId: user.id }),
        },
      });
      if (!row) return reply.status(404).send({ error: "Subscription not found" });
      if (row.status === "canceled") {
        const full = await findBillingSubscription({
          where: { id: row.id },
          include: { plan: true },
        });
        return { subscription: toSubscriptionRecord(full!) };
      }
      try {
        const subscription = await cancelBillingSubscription(row.id, user);
        return { subscription };
      } catch (err) {
        const message = errorMessage(err);
        return reply.status(502).send({ error: message });
      }
    },
  );

  // --- Checkout (session) ---
  app.post("/api/billing/checkout", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    if (!mollieConfigured()) {
      return reply.status(503).send({ error: "Mollie is not configured (set MOLLIE_API_KEY)" });
    }
    if (user.role === "ADMIN") {
      return reply.status(400).send({ error: "Admins already have unlimited quotas" });
    }

    const parsed = z
      .object({
        planSlug: z.string().trim().min(1).max(64),
        redirectUrl: z.string().url().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
    }

    const plan = await findPlanTemplate({
      where: { slug: parsed.data.planSlug },
    });
    if (!plan || !plan.enabled) {
      return reply.status(404).send({ error: "Plan not found" });
    }
    if (plan.priceCents < 1) {
      return reply.status(400).send({ error: "This plan has no price — ask an admin to grant it" });
    }

    const paymentId = nanoid(16);
    const redirectUrl = safeBillingRedirectUrl(parsed.data.redirectUrl, paymentId);
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
        return reply.status(502).send({ error: `Mollie customer: ${message}` });
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
      return reply.status(502).send({ error: `Mollie: ${message}` });
    }

    const checkoutUrl = mollieCheckoutUrl(mollie);
    if (!checkoutUrl) {
      return reply.status(502).send({ error: "Mollie did not return a checkout URL" });
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

    logActivity({
      action: "billing.checkout",
      request,
      user,
      metadata: {
        paymentId: row.id,
        mollieId: mollie.id,
        planSlug: plan.slug,
        amountCents: plan.priceCents,
        recurring: Boolean(plan.recurringInterval),
      },
    });

    return reply.status(201).send({
      payment: toPaymentRecord(row),
      checkoutUrl,
    });
  });

  // --- Sync one payment from Mollie (session, after redirect) ---
  app.post<{ Params: { id: string } }>("/api/billing/payments/:id/sync", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const row = await findPayment({
      where: {
        id: request.params.id,
        ...(user.role === "ADMIN" ? {} : { userId: user.id }),
      },
    });
    if (!row) return reply.status(404).send({ error: "Payment not found" });
    if (!row.mollieId) {
      return reply.status(400).send({ error: "Payment has no Mollie id" });
    }

    try {
      const result = await syncMolliePayment(row.mollieId);
      return { payment: result };
    } catch (err) {
      const message = errorMessage(err);
      return reply.status(502).send({ error: message });
    }
  });

  // --- Mollie webhook (public, CSRF-exempt) ---
  app.post("/api/public/billing/mollie", async (request, reply) => {
    if (!mollieConfigured()) {
      return reply.status(503).send({ error: "Mollie not configured" });
    }

    const rl = await getRateLimitStore().hit(
      `mollie-webhook:${request.ip || "unknown"}`,
      MOLLIE_WEBHOOK_WINDOW_MS,
      MOLLIE_WEBHOOK_MAX,
    );
    if (rl.limited) {
      return reply.status(429).send({ error: "Too many webhook requests" });
    }

    if (!mollieWebhookIpAllowed(request.ip)) {
      return reply.status(403).send({ error: "Webhook source not allowed" });
    }

    let mollieId: string | null = null;
    const body = request.body as unknown;
    if (body && typeof body === "object" && "id" in body) {
      const id = (body as { id: unknown }).id;
      if (typeof id === "string") mollieId = id;
    }
    // application/x-www-form-urlencoded may arrive as string or already parsed
    if (!mollieId && typeof body === "string") {
      const params = new URLSearchParams(body);
      mollieId = params.get("id");
    }

    if (!mollieId) {
      // Fastify may put form fields on body when content-type is form
      const raw = request.body as { id?: string } | undefined;
      if (raw && typeof raw.id === "string") mollieId = raw.id;
    }

    if (!mollieId?.startsWith("tr_")) {
      return reply.status(400).send({ error: "Missing Mollie payment id" });
    }

    // Only sync ids we created — ignore probes without calling Mollie.
    const known = await findPayment({
      where: { mollieId },
      select: { id: true },
    });
    if (!known) {
      return { ok: true };
    }

    try {
      await syncMolliePayment(mollieId);
      return { ok: true };
    } catch (err) {
      const message = errorMessage(err);
      console.error("[billing] mollie webhook:", message);
      // Still 200 so Mollie doesn't hammer forever on permanent errors
      return { ok: false, error: message };
    }
  });
}
