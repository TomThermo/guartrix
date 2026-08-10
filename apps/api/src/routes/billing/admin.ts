import type { FastifyInstance } from "fastify";
import { logActivity } from "../../activity-log.js";
import { requireAdmin } from "../../auth/auth.js";
import { sendZodError } from "../../http-error.js";
import { planBodySchema } from "../../schemas/billing.js";
import {
  createPlanFromBody,
  deletePlanById,
  findPlanById,
  findPlanBySlug,
  listAllPayments,
  listPlanTemplates,
  toPlanRecord,
  updatePlanFromBody,
} from "../../services/billing-plans.js";

export function registerBillingAdminRoutes(app: FastifyInstance): void {
  app.get("/api/admin/plans", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "billing.read"))) return;
    const plans = await listPlanTemplates();
    return { plans };
  });

  app.post("/api/admin/plans", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "billing.write");
    if (!admin) return;
    const parsed = planBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
    }
    const clash = await findPlanBySlug(parsed.data.slug);
    if (clash) return reply.status(409).send({ error: "Slug already exists" });

    const row = await createPlanFromBody(parsed.data);
    logActivity({
      action: "plan.create",
      request,
      user: admin,
      metadata: { planId: row.id, slug: row.slug, priceCents: row.priceCents },
    });
    return reply.status(201).send({ plan: toPlanRecord(row) });
  });

  app.patch<{ Params: { id: string } }>("/api/admin/plans/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "billing.write");
    if (!admin) return;
    const parsed = planBodySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return sendZodError(reply, parsed);
    }
    const existing = await findPlanById(request.params.id);
    if (!existing) return reply.status(404).send({ error: "Plan not found" });

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const clash = await findPlanBySlug(parsed.data.slug);
      if (clash) return reply.status(409).send({ error: "Slug already exists" });
    }

    const row = await updatePlanFromBody(existing.id, parsed.data);
    logActivity({
      action: "plan.update",
      request,
      user: admin,
      metadata: { planId: row.id, slug: row.slug, fields: Object.keys(parsed.data) },
    });
    return { plan: toPlanRecord(row) };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/plans/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "billing.write");
    if (!admin) return;
    const existing = await findPlanById(request.params.id);
    if (!existing) return reply.status(404).send({ error: "Plan not found" });
    await deletePlanById(existing.id);
    logActivity({
      action: "plan.delete",
      request,
      user: admin,
      metadata: { planId: existing.id, slug: existing.slug },
    });
    return { ok: true };
  });

  app.get("/api/admin/payments", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "billing.read"))) return;
    const payments = await listAllPayments();
    return { payments };
  });
}
