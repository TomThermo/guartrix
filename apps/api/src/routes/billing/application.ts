import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { requireApplication } from "../../auth/application-auth.js";
import { logActivity } from "../../activity-log.js";
import { toPaymentRecord, toPlanRecord } from "../../billing/billing.js";
import { sendZodError } from "../../http-error.js";
import { planBodySchema } from "./serialize.js";
import { createPlanTemplate, findManyPayments, findManyPlanTemplates, findPlanTemplate } from "../../repositories/billing.js";

export function registerBillingApplicationRoutes(app: FastifyInstance): void {
  // --- Application API: plans + payments ---
  app.get("/api/application/plans", async (request, reply) => {
    if (!(await requireApplication(request, reply, "plans.read"))) return;
    const rows = await findManyPlanTemplates({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

  app.post("/api/application/plans", async (request, reply) => {
    const ctx = await requireApplication(request, reply, "plans.write");
    if (!ctx) return;
    const parsed = planBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
    }
    const clash = await findPlanTemplate({
      where: { slug: parsed.data.slug },
    });
    if (clash) return reply.status(409).send({ error: "Slug already exists" });
    const row = await createPlanTemplate({
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
    const rows = await findManyPayments({
      include: { plan: true, user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { payments: rows.map(toPaymentRecord) };
  });
}
