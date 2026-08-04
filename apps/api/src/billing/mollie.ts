/**
 * Thin Mollie Payments / Customers / Subscriptions API v2 client.
 * Docs: https://docs.mollie.com/reference/create-payment
 */

export interface MollieAmount {
  currency: string;
  /** Decimal string with exactly 2 places, e.g. "10.00" */
  value: string;
}

export interface MolliePayment {
  resource: string;
  id: string;
  mode: string;
  status: string;
  amount: MollieAmount;
  description: string;
  metadata?: unknown;
  sequenceType?: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  mandateId?: string | null;
  checkoutUrl?: string | null;
  _links?: {
    checkout?: { href: string; type: string };
    self?: { href: string; type: string };
  };
}

export interface MollieCustomer {
  resource: string;
  id: string;
  name?: string | null;
  email?: string | null;
  metadata?: unknown;
}

export interface MollieSubscription {
  resource: string;
  id: string;
  customerId: string;
  status: string;
  amount: MollieAmount;
  times?: number | null;
  interval: string;
  description: string;
  metadata?: unknown;
  webhookUrl?: string | null;
}

export function mollieConfigured(): boolean {
  const key = process.env.MOLLIE_API_KEY?.trim();
  return Boolean(key);
}

export function mollieTestMode(): boolean {
  const key = process.env.MOLLIE_API_KEY?.trim() ?? "";
  return key.startsWith("test_");
}

export function mollieApiKey(): string {
  const key = process.env.MOLLIE_API_KEY?.trim();
  if (!key) throw new Error("Mollie is not configured (set MOLLIE_API_KEY)");
  return key;
}

/** Convert integer cents to Mollie amount value string. */
export function centsToMollieValue(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) {
    throw new Error("Invalid amount");
  }
  return (cents / 100).toFixed(2);
}

async function mollieFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const key = mollieApiKey();
  const res = await fetch(`https://api.mollie.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { detail: text };
  }
  if (!res.ok) {
    const detail =
      body &&
      typeof body === "object" &&
      "detail" in body &&
      typeof (body as { detail: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : text || `Mollie error ${res.status}`;
    throw new Error(detail);
  }
  return body as T;
}

export async function mollieCreateCustomer(input: {
  name: string;
  email?: string | null;
  metadata?: Record<string, string>;
}): Promise<MollieCustomer> {
  return mollieFetch<MollieCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 255),
      ...(input.email ? { email: input.email } : {}),
      metadata: input.metadata ?? {},
    }),
  });
}

export async function mollieCreatePayment(input: {
  amountCents: number;
  currency?: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  metadata?: Record<string, string>;
  customerId?: string;
  sequenceType?: "oneoff" | "first" | "recurring";
}): Promise<MolliePayment> {
  const currency = (input.currency || "EUR").toUpperCase();
  const payment = await mollieFetch<MolliePayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: {
        currency,
        value: centsToMollieValue(input.amountCents),
      },
      description: input.description.slice(0, 255),
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: input.metadata ?? {},
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.sequenceType ? { sequenceType: input.sequenceType } : {}),
    }),
  });
  return payment;
}

export async function mollieGetPayment(mollieId: string): Promise<MolliePayment> {
  return mollieFetch<MolliePayment>(`/payments/${encodeURIComponent(mollieId)}`);
}

export async function mollieCreateSubscription(input: {
  customerId: string;
  amountCents: number;
  currency?: string;
  interval: string;
  description: string;
  webhookUrl: string;
  /** YYYY-MM-DD — first charge after the initial payment. */
  startDate?: string;
  metadata?: Record<string, string>;
}): Promise<MollieSubscription> {
  const currency = (input.currency || "EUR").toUpperCase();
  return mollieFetch<MollieSubscription>(
    `/customers/${encodeURIComponent(input.customerId)}/subscriptions`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: {
          currency,
          value: centsToMollieValue(input.amountCents),
        },
        interval: input.interval,
        description: input.description.slice(0, 255),
        webhookUrl: input.webhookUrl,
        ...(input.startDate ? { startDate: input.startDate } : {}),
        metadata: input.metadata ?? {},
      }),
    },
  );
}

export async function mollieCancelSubscription(
  customerId: string,
  subscriptionId: string,
): Promise<MollieSubscription> {
  return mollieFetch<MollieSubscription>(
    `/customers/${encodeURIComponent(customerId)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "DELETE" },
  );
}

export function mollieCheckoutUrl(payment: MolliePayment): string | null {
  return payment._links?.checkout?.href ?? payment.checkoutUrl ?? null;
}

/** Map Mollie status string → our PaymentStatus enum value. */
export function mapMollieStatus(
  status: string,
): "OPEN" | "PENDING" | "PAID" | "FAILED" | "CANCELED" | "EXPIRED" {
  switch (status) {
    case "paid":
      return "PAID";
    case "pending":
    case "authorized":
      return "PENDING";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELED";
    case "expired":
      return "EXPIRED";
    case "open":
    default:
      return "OPEN";
  }
}

/** Add a Mollie interval string onto a Date (best-effort). */
export function addMollieInterval(from: Date, interval: string): Date {
  const m = /^(\d+)\s+(day|days|week|weeks|month|months|year|years)$/i.exec(
    interval.trim(),
  );
  const n = m ? Number(m[1]) : 1;
  const unit = (m?.[2] || "month").toLowerCase();
  const out = new Date(from);
  if (unit.startsWith("day")) out.setDate(out.getDate() + n);
  else if (unit.startsWith("week")) out.setDate(out.getDate() + n * 7);
  else if (unit.startsWith("year")) out.setFullYear(out.getFullYear() + n);
  else out.setMonth(out.getMonth() + n);
  return out;
}

export function toMollieDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
