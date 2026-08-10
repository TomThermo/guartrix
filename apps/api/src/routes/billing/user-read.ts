import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import { cancelBillingSubscription, toPaymentRecord, toPlanRecord, toSubscriptionRecord } from "../../billing/billing.js";
import { syncMolliePayment } from "../../billing/billing-mollie-sync.js";
import { requireAuth, requireSessionAuth } from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { errorMessage, sendZodError } from "../../http-error.js";
import { mollieConfigured, mollieTestMode } from "../../billing/mollie.js";
import {
  findBillingSubscription,
  findFirstBillingSubscription,
  findManyBillingSubscriptions,
  findManyPayments,
  findManyPlanTemplates,
  findPayment,
} from "../../services/billing.js";
import { createBillingCheckout } from "../../services/billing-checkout.js";

export function registerBillingUserReadRoutes(app: FastifyInstance): void {
  app.get("/api/billing/mollie-status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return {
      configured: mollieConfigured(),
      testMode: mollieConfigured() ? mollieTestMode() : false,
    };
  });

  app.get("/api/billing/plans", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const rows = await findManyPlanTemplates({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

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

  app.post("/api/billing/checkout", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const parsed = z
      .object({
        planSlug: z.string().trim().min(1).max(64),
        redirectUrl: z.string().url().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
    }

    const result = await createBillingCheckout(user, parsed.data, request);
    if ("error" in result) {
      return reply.status(result.status).send({ error: result.error });
    }

    logActivity({
      action: "billing.checkout",
      request,
      user,
      metadata: result.activity,
    });

    return reply.status(201).send({
      payment: toPaymentRecord(result.payment),
      checkoutUrl: result.checkoutUrl,
    });
  });

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
}
