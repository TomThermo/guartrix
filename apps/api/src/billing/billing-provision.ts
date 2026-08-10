import { nanoid } from "nanoid";
import type { PaymentRecord, ServerType } from "@guartrix/shared";
import { logActivity } from "../activity-log.js";
import { prisma } from "../db.js";
import { toPaymentRecord, toPlanRecord } from "./billing-records.js";
import { ensureMollieSubscriptionForPayment } from "./billing-subscriptions.js";
import { emitBillingWebhook } from "./billing-webhook.js";

/**
 * Apply plan quotas to a user (set to plan values). Admins stay unlimited.
 * Idempotent when called twice for the same payment via provisionPayment.
 */
export async function applyPlanToUser(
  userId: string,
  plan: {
    maxServers: number;
    maxMemoryMb: number;
    maxDatabases: number;
    slug: string;
    name: string;
  },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.role === "ADMIN") return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      maxServers: plan.maxServers,
      maxMemoryMb: plan.maxMemoryMb,
      maxDatabases: plan.maxDatabases,
    },
  });
}

async function pickFreePort(nodeId: string, type: ServerType): Promise<number> {
  const { pickFreeGamePort } = await import("../servers/game-port.js");
  return pickFreeGamePort(nodeId, type);
}

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
 * Create a server from plan defaults after payment. Errors are stored on payment
 * metadata and do not roll back quota provisioning.
 */
export async function autoCreateServerForPayment(paymentId: string): Promise<{
  serverId?: string;
  error?: string;
}> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { plan: true, user: true },
  });
  if (!payment?.plan?.autoCreateServer) return {};
  if (!payment.user || payment.user.role === "ADMIN") return {};

  const plan = payment.plan;
  const meta = parseMetadata(payment.metadata);
  if (meta.renewal) return {};
  if (meta.autoServerId) {
    return { serverId: String(meta.autoServerId) };
  }
  if (meta.autoServerError) {
    return { error: String(meta.autoServerError) };
  }

  try {
    const { assertCanCreateServer } = await import("./quotas.js");
    await assertCanCreateServer(
      {
        id: payment.user.id,
        role: payment.user.role,
        maxServers: payment.user.maxServers,
        maxMemoryMb: payment.user.maxMemoryMb,
        maxDatabases: payment.user.maxDatabases,
      },
      plan.defaultMemoryMb,
      { diskMb: plan.defaultDiskMb },
    );

    const { assertNodeCapacity, resolveCreateNodeId } = await import("../nodes/nodes.js");
    const nodeId = await resolveCreateNodeId(undefined);
    await assertNodeCapacity(nodeId, plan.defaultMemoryMb, { placement: true });
    const type = (
      [
        "VANILLA",
        "PAPER",
        "FABRIC",
        "FORGE",
        "PURPUR",
        "NEOFORGE",
        "QUILT",
        "BEDROCK",
        "BEDROCK_PREVIEW",
        "POCKETMINE",
        "NUKKIT",
      ] as const
    ).includes(plan.defaultServerType as never)
      ? (plan.defaultServerType as ServerType)
      : "PAPER";

    const port = await pickFreePort(nodeId, type);

    const id = nanoid(12);
    const name = `${plan.slug}-${id.slice(0, 6)}`;

    const { provisionPreparedServer, autoStartProvisionedServer } = await import(
      "../servers/server-provision.js"
    );
    await provisionPreparedServer({
      id,
      name,
      type,
      mcVersion: plan.defaultMcVersion || "1.21.1",
      port,
      memoryMb: plan.defaultMemoryMb,
      diskMb: plan.defaultDiskMb,
      cpuLimit: 0,
      ownerId: payment.userId,
      nodeId,
      cleanupOnFailure: true,
    });

    await autoStartProvisionedServer(id);

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        metadata: JSON.stringify({
          ...meta,
          autoServerId: id,
          autoServerPort: port,
        }),
      },
    });

    logActivity({
      action: "server.create",
      actor: "billing",
      user: { id: payment.userId, username: payment.user.username },
      serverId: id,
      serverName: name,
      metadata: {
        via: "billing-auto-create",
        paymentId,
        planSlug: plan.slug,
      },
    });

    return { serverId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        metadata: JSON.stringify({
          ...meta,
          autoServerError: message,
        }),
      },
    });
    console.error(`[billing] auto-create server failed for ${paymentId}:`, message);
    return { error: message };
  }
}

/**
 * Mark payment paid + apply plan once. Safe under concurrent webhooks.
 */
export async function provisionPaidPayment(paymentId: string): Promise<{
  already: boolean;
  payment: PaymentRecord;
}> {
  const existing = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      plan: true,
      user: { select: { username: true, role: true } },
    },
  });
  if (!existing) throw new Error("Payment not found");
  if (existing.provisioned) {
    return { already: true, payment: toPaymentRecord(existing) };
  }
  if (existing.status !== "PAID") {
    throw new Error("Payment is not paid");
  }
  if (!existing.plan) {
    throw new Error("Payment has no plan");
  }

  if (existing.user?.role !== "ADMIN") {
    await applyPlanToUser(existing.userId, existing.plan);
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      provisioned: true,
      provisionedAt: new Date(),
    },
    include: { plan: true, user: { select: { username: true } } },
  });

  const auto = await autoCreateServerForPayment(paymentId);
  await ensureMollieSubscriptionForPayment(paymentId);

  logActivity({
    action: "billing.provisioned",
    actor: "billing",
    user: updated.user
      ? { id: updated.userId, username: updated.user.username }
      : { id: updated.userId, username: "user" },
    metadata: {
      paymentId: updated.id,
      mollieId: updated.mollieId,
      planSlug: updated.plan?.slug,
      maxServers: updated.plan?.maxServers,
      maxMemoryMb: updated.plan?.maxMemoryMb,
      maxDatabases: updated.plan?.maxDatabases,
      ...(auto.serverId ? { autoServerId: auto.serverId } : {}),
      ...(auto.error ? { autoServerError: auto.error } : {}),
    },
  });

  await emitBillingWebhook("payment.provisioned", {
    payment: toPaymentRecord(updated),
    plan: updated.plan ? toPlanRecord(updated.plan) : null,
    ...(auto.serverId ? { autoServerId: auto.serverId } : {}),
    ...(auto.error ? { autoServerError: auto.error } : {}),
  });

  return { already: false, payment: toPaymentRecord(updated) };
}
