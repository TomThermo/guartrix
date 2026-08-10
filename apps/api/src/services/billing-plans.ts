import { nanoid } from "nanoid";
import { toPaymentRecord, toPlanRecord } from "../billing/billing.js";
import {
  createPlanTemplate,
  deletePlanTemplate,
  findManyPayments,
  findManyPlanTemplates,
  findPlanTemplate,
  updatePlanTemplate,
} from "./billing.js";
import type { PlanBodyInput } from "../schemas/billing.js";

export async function listPlanTemplates() {
  const rows = await findManyPlanTemplates({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toPlanRecord);
}

export async function findPlanById(id: string) {
  return findPlanTemplate({ where: { id } });
}

export async function findPlanBySlug(slug: string) {
  return findPlanTemplate({ where: { slug } });
}

export async function createPlanFromBody(body: PlanBodyInput) {
  return createPlanTemplate({
    data: {
      id: nanoid(12),
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      priceCents: body.priceCents,
      currency: body.currency.toUpperCase(),
      maxServers: body.maxServers,
      maxMemoryMb: body.maxMemoryMb,
      maxDatabases: body.maxDatabases,
      defaultMemoryMb: body.defaultMemoryMb ?? 4096,
      defaultDiskMb: body.defaultDiskMb ?? 10_240,
      autoCreateServer: body.autoCreateServer ?? false,
      defaultServerType: body.defaultServerType ?? "PAPER",
      defaultMcVersion: body.defaultMcVersion ?? "1.21.1",
      recurringInterval: body.recurringInterval ?? null,
      enabled: body.enabled ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
}

export async function updatePlanFromBody(id: string, body: Partial<PlanBodyInput>) {
  return updatePlanTemplate({
    where: { id },
    data: {
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.priceCents !== undefined ? { priceCents: body.priceCents } : {}),
      ...(body.currency !== undefined ? { currency: body.currency.toUpperCase() } : {}),
      ...(body.maxServers !== undefined ? { maxServers: body.maxServers } : {}),
      ...(body.maxMemoryMb !== undefined ? { maxMemoryMb: body.maxMemoryMb } : {}),
      ...(body.maxDatabases !== undefined ? { maxDatabases: body.maxDatabases } : {}),
      ...(body.defaultMemoryMb !== undefined ? { defaultMemoryMb: body.defaultMemoryMb } : {}),
      ...(body.defaultDiskMb !== undefined ? { defaultDiskMb: body.defaultDiskMb } : {}),
      ...(body.autoCreateServer !== undefined ? { autoCreateServer: body.autoCreateServer } : {}),
      ...(body.defaultServerType !== undefined
        ? { defaultServerType: body.defaultServerType }
        : {}),
      ...(body.defaultMcVersion !== undefined ? { defaultMcVersion: body.defaultMcVersion } : {}),
      ...(body.recurringInterval !== undefined
        ? { recurringInterval: body.recurringInterval }
        : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
}

export async function deletePlanById(id: string) {
  return deletePlanTemplate({ where: { id } });
}

export async function listAllPayments() {
  const rows = await findManyPayments({
    include: { plan: true, user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toPaymentRecord);
}

export { toPlanRecord, toPaymentRecord };
