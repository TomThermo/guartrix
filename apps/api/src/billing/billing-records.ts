import type { BillingSubscriptionRecord, PaymentRecord, PlanTemplateRecord } from "@guartrix/shared";

export function toPlanRecord(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  maxServers: number;
  maxMemoryMb: number;
  maxDatabases: number;
  defaultMemoryMb: number;
  defaultDiskMb: number;
  autoCreateServer: boolean;
  defaultServerType: string;
  defaultMcVersion: string;
  recurringInterval: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PlanTemplateRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    maxServers: row.maxServers,
    maxMemoryMb: row.maxMemoryMb,
    maxDatabases: row.maxDatabases,
    defaultMemoryMb: row.defaultMemoryMb,
    defaultDiskMb: row.defaultDiskMb,
    autoCreateServer: row.autoCreateServer,
    defaultServerType: row.defaultServerType,
    defaultMcVersion: row.defaultMcVersion,
    recurringInterval: row.recurringInterval,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPaymentRecord(row: {
  id: string;
  mollieId: string | null;
  userId: string;
  planId: string | null;
  status: string;
  amountCents: number;
  currency: string;
  description: string;
  checkoutUrl: string | null;
  provisioned: boolean;
  provisionedAt: Date | null;
  subscriptionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { username: string } | null;
  plan?: { slug: string; name: string } | null;
}): PaymentRecord {
  return {
    id: row.id,
    mollieId: row.mollieId,
    userId: row.userId,
    username: row.user?.username ?? null,
    planId: row.planId,
    planSlug: row.plan?.slug ?? null,
    planName: row.plan?.name ?? null,
    status: row.status as PaymentRecord["status"],
    amountCents: row.amountCents,
    currency: row.currency,
    description: row.description,
    checkoutUrl: row.checkoutUrl,
    provisioned: row.provisioned,
    provisionedAt: row.provisionedAt?.toISOString() ?? null,
    subscriptionId: row.subscriptionId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSubscriptionRecord(row: {
  id: string;
  planId: string | null;
  interval: string;
  amountCents: number;
  currency: string;
  status: string;
  mollieSubscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  canceledAt: Date | null;
  plan?: { slug: string; name: string } | null;
}): BillingSubscriptionRecord {
  return {
    id: row.id,
    planId: row.planId,
    planSlug: row.plan?.slug ?? null,
    planName: row.plan?.name ?? null,
    interval: row.interval,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    mollieSubscriptionId: row.mollieSubscriptionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canceledAt: row.canceledAt?.toISOString() ?? null,
  };
}
