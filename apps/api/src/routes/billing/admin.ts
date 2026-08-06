import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { logActivity } from "../../activity-log.js";
import { toPaymentRecord, toPlanRecord } from "../../billing/billing.js";
import { requireAdmin } from "../../auth/auth.js";
import { prisma } from "../../db.js";
import { sendZodError } from "../../http-error.js";
import { planBodySchema } from "./serialize.js";

export function registerBillingAdminRoutes(app: FastifyInstance): void {
  // --- Admin: all plans ---
  app.get("/api/admin/plans", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "billing.read"))) return;
    const rows = await prisma.planTemplate.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { plans: rows.map(toPlanRecord) };
  });

  app.post("/api/admin/plans", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "billing.write");
    if (!admin) return;
    const parsed = planBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
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
      const admin = await requireAdmin(request, reply, "billing.write");
      if (!admin) return;
      const parsed = planBodySchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return sendZodError(reply, parsed);
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
      const admin = await requireAdmin(request, reply, "billing.write");
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
    if (!(await requireAdmin(request, reply, "billing.read"))) return;
    const rows = await prisma.payment.findMany({
      include: { plan: true, user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { payments: rows.map(toPaymentRecord) };
  });

}
