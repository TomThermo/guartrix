import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { requireApplication } from "../application-auth.js";
import { logActivity } from "../activity-log.js";
import {
  cancelBillingSubscription,
  emitBillingWebhook,
  provisionPaidPayment,
  revokePlanAfterFailedRenewal,
  toPaymentRecord,
  toPlanRecord,
  toSubscriptionRecord,
} from "../billing.js";
import { requireAdmin, requireAuth, requireSessionAuth } from "../auth.js";
import { config } from "../config.js";
import { assertSameOrigin } from "../csrf.js";
import { prisma } from "../db.js";
import {
  mapMollieStatus,
  mollieCheckoutUrl,
  mollieConfigured,
  mollieCreateCustomer,
  mollieCreatePayment,
  mollieGetPayment,
  mollieTestMode,
} from "../mollie.js";

const planBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase-kebab"),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().min(3).max(3).default("EUR"),
  maxServers: z.number().int().min(0).max(10_000),
  maxMemoryMb: z.number().int().min(0).max(10_485_760),
  maxDatabases: z.number().int().min(0).max(10_000),
  defaultMemoryMb: z.number().int().min(512).max(65536).optional(),
  defaultDiskMb: z.number().int().min(1024).max(10_485_760).optional(),
  autoCreateServer: z.boolean().optional(),
  defaultServerType: z
    .enum([
      "VANILLA",
      "PAPER",
      "FABRIC",
      "FORGE",
      "PURPUR",
      "NEOFORGE",
      "QUILT",
    ])
    .optional(),
  defaultMcVersion: z.string().trim().min(1).max(32).optional(),
  recurringInterval: z
    .string()
    .trim()
    .regex(/^\d+\s+(days?|weeks?|months?|years?)$/i)
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

function panelBase(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

export function registerBillingRoutes(app: FastifyInstance): void {
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
    const rows = await prisma.planTemplate.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

  // --- Own payments ---
  app.get("/api/billing/payments", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;
    const rows = await prisma.payment.findMany({
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
    const rows = await prisma.billingSubscription.findMany({
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
      const row = await prisma.billingSubscription.findFirst({
        where: {
          id: request.params.id,
          ...(user.role === "ADMIN" ? {} : { userId: user.id }),
        },
      });
      if (!row) return reply.status(404).send({ error: "Subscription not found" });
      if (row.status === "canceled") {
        const full = await prisma.billingSubscription.findUnique({
          where: { id: row.id },
          include: { plan: true },
        });
        return { subscription: toSubscriptionRecord(full!) };
      }
      try {
        const subscription = await cancelBillingSubscription(row.id, user);
        return { subscription };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
      return reply
        .status(503)
        .send({ error: "Mollie is not configured (set MOLLIE_API_KEY)" });
    }
    if (user.role === "ADMIN") {
      return reply
        .status(400)
        .send({ error: "Admins already have unlimited quotas" });
    }

    const parsed = z
      .object({
        planSlug: z.string().trim().min(1).max(64),
        redirectUrl: z.string().url().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const plan = await prisma.planTemplate.findUnique({
      where: { slug: parsed.data.planSlug },
    });
    if (!plan || !plan.enabled) {
      return reply.status(404).send({ error: "Plan not found" });
    }
    if (plan.priceCents < 1) {
      return reply
        .status(400)
        .send({ error: "This plan has no price — ask an admin to grant it" });
    }

    const paymentId = nanoid(16);
    const redirectUrl =
      parsed.data.redirectUrl ||
      `${panelBase()}/account/billing?payment=${paymentId}`;
    const webhookUrl = `${panelBase()}/api/public/billing/mollie`;

    let customerId: string | null = null;
    let localSubscriptionId: string | null = null;

    if (plan.recurringInterval) {
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        customerId = dbUser?.mollieCustomerId ?? null;
        if (!customerId) {
          const customer = await mollieCreateCustomer({
            name: user.username,
            email: dbUser?.email ?? null,
            metadata: { userId: user.id },
          });
          customerId = customer.id;
          await prisma.user.update({
            where: { id: user.id },
            data: { mollieCustomerId: customerId },
          });
        }
        const sub = await prisma.billingSubscription.create({
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
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Mollie customer: ${message}` });
      }
    }

    let mollie;
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
          ...(localSubscriptionId
            ? { localSubscriptionId }
            : {}),
        },
        ...(customerId
          ? {
              customerId,
              sequenceType: plan.recurringInterval ? ("first" as const) : undefined,
            }
          : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Mollie: ${message}` });
    }

    const checkoutUrl = mollieCheckoutUrl(mollie);
    if (!checkoutUrl) {
      return reply.status(502).send({ error: "Mollie did not return a checkout URL" });
    }

    const row = await prisma.payment.create({
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
  app.post<{ Params: { id: string } }>(
    "/api/billing/payments/:id/sync",
    async (request, reply) => {
      const originErr = assertSameOrigin(request);
      if (originErr) return reply.status(403).send({ error: originErr });
      const user = await requireSessionAuth(request, reply);
      if (!user) return;

      const row = await prisma.payment.findFirst({
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
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: message });
      }
    },
  );

  // --- Mollie webhook (public, CSRF-exempt) ---
  app.post("/api/public/billing/mollie", async (request, reply) => {
    if (!mollieConfigured()) {
      return reply.status(503).send({ error: "Mollie not configured" });
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

    try {
      await syncMolliePayment(mollieId);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[billing] mollie webhook:", message);
      // Still 200 so Mollie doesn't hammer forever on permanent errors
      return { ok: false, error: message };
    }
  });

  // --- Admin: all plans ---
  app.get("/api/admin/plans", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const rows = await prisma.planTemplate.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

  app.post("/api/admin/plans", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = planBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const clash = await prisma.planTemplate.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (clash) return reply.status(409).send({ error: "Slug already exists" });

    const row = await prisma.planTemplate.create({
      data: {
        id: nanoid(12),
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        priceCents: parsed.data.priceCents,
        currency: parsed.data.currency.toUpperCase(),
        maxServers: parsed.data.maxServers,
        maxMemoryMb: parsed.data.maxMemoryMb,
        maxDatabases: parsed.data.maxDatabases,
        defaultMemoryMb: parsed.data.defaultMemoryMb ?? 4096,
        defaultDiskMb: parsed.data.defaultDiskMb ?? 10_240,
        autoCreateServer: parsed.data.autoCreateServer ?? false,
        defaultServerType: parsed.data.defaultServerType ?? "PAPER",
        defaultMcVersion: parsed.data.defaultMcVersion ?? "1.21.1",
        recurringInterval: parsed.data.recurringInterval ?? null,
        enabled: parsed.data.enabled ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    logActivity({
      action: "plan.create",
      request,
      user: admin,
      metadata: { planId: row.id, slug: row.slug, priceCents: row.priceCents },
    });
    return reply.status(201).send({ plan: toPlanRecord(row) });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/admin/plans/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const parsed = planBodySchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const existing = await prisma.planTemplate.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Plan not found" });

      if (parsed.data.slug && parsed.data.slug !== existing.slug) {
        const clash = await prisma.planTemplate.findUnique({
          where: { slug: parsed.data.slug },
        });
        if (clash) return reply.status(409).send({ error: "Slug already exists" });
      }

      const row = await prisma.planTemplate.update({
        where: { id: existing.id },
        data: {
          ...parsed.data,
          ...(parsed.data.currency
            ? { currency: parsed.data.currency.toUpperCase() }
            : {}),
        },
      });
      logActivity({
        action: "plan.update",
        request,
        user: admin,
        metadata: { planId: row.id, slug: row.slug, fields: Object.keys(parsed.data) },
      });
      return { plan: toPlanRecord(row) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/plans/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const existing = await prisma.planTemplate.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Plan not found" });
      await prisma.planTemplate.delete({ where: { id: existing.id } });
      logActivity({
        action: "plan.delete",
        request,
        user: admin,
        metadata: { planId: existing.id, slug: existing.slug },
      });
      return { ok: true };
    },
  );

  app.get("/api/admin/payments", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const rows = await prisma.payment.findMany({
      include: { plan: true, user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { payments: rows.map(toPaymentRecord) };
  });

  // --- Application API: plans + payments ---
  app.get("/api/application/plans", async (request, reply) => {
    if (!(await requireApplication(request, reply, "plans.read"))) return;
    const rows = await prisma.planTemplate.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

  app.post("/api/application/plans", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "plans.write");
    if (!ctx) return;
    const parsed = planBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const clash = await prisma.planTemplate.findUnique({
      where: { slug: parsed.data.slug },
    });
    if (clash) return reply.status(409).send({ error: "Slug already exists" });
    const row = await prisma.planTemplate.create({
      data: {
        id: nanoid(12),
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        priceCents: parsed.data.priceCents,
        currency: parsed.data.currency.toUpperCase(),
        maxServers: parsed.data.maxServers,
        maxMemoryMb: parsed.data.maxMemoryMb,
        maxDatabases: parsed.data.maxDatabases,
        defaultMemoryMb: parsed.data.defaultMemoryMb ?? 4096,
        defaultDiskMb: parsed.data.defaultDiskMb ?? 10_240,
        autoCreateServer: parsed.data.autoCreateServer ?? false,
        defaultServerType: parsed.data.defaultServerType ?? "PAPER",
        defaultMcVersion: parsed.data.defaultMcVersion ?? "1.21.1",
        recurringInterval: parsed.data.recurringInterval ?? null,
        enabled: parsed.data.enabled ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    logActivity({
      action: "plan.create",
      actor: `app:${ctx.prefix}`,
      metadata: { planId: row.id, slug: row.slug, via: "application-api" },
    });
    return reply.status(201).send({ plan: toPlanRecord(row) });
  });

  app.get("/api/application/payments", async (request, reply) => {
    if (!(await requireApplication(request, reply, "payments.read"))) return;
    const rows = await prisma.payment.findMany({
      include: { plan: true, user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { payments: rows.map(toPaymentRecord) };
  });
}

async function syncMolliePayment(mollieId: string) {
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
          amountCents: Math.round(
            Number(mollie.amount?.value || "0") * 100,
          ) || localSub.amountCents,
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

  if (
    (status === "FAILED" || status === "CANCELED" || status === "EXPIRED") &&
    !wasPaid
  ) {
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
