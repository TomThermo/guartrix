import type {
  BillingSubscriptionRecord,
  PaymentRecord,
  PlanTemplateRecord,
  MollieStatusResponse,
  CreateCheckoutResponse,
} from "@guartrix/shared";
import { request } from "./client";

export const billingApi = {
  mollieStatus: () => request<MollieStatusResponse>("/api/billing/mollie-status"),
  listBillingPlans: () => request<{ plans: PlanTemplateRecord[] }>("/api/billing/plans"),
  listMyPayments: () => request<{ payments: PaymentRecord[] }>("/api/billing/payments"),
  listMySubscriptions: () =>
    request<{ subscriptions: BillingSubscriptionRecord[] }>("/api/billing/subscriptions"),
  cancelSubscription: (id: string) =>
    request<{ subscription: BillingSubscriptionRecord }>(
      `/api/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body: "{}" },
    ),
  createCheckout: (body: { planSlug: string; redirectUrl?: string }) =>
    request<CreateCheckoutResponse>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  syncPayment: (id: string) =>
    request<{ payment: PaymentRecord }>(`/api/billing/payments/${encodeURIComponent(id)}/sync`, {
      method: "POST",
      body: "{}",
    }),
  adminListPlans: () => request<{ plans: PlanTemplateRecord[] }>("/api/admin/plans"),
  adminCreatePlan: (
    body: Partial<PlanTemplateRecord> & {
      slug: string;
      name: string;
      priceCents: number;
      maxServers: number;
      maxMemoryMb: number;
      maxDatabases: number;
    },
  ) =>
    request<{ plan: PlanTemplateRecord }>("/api/admin/plans", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdatePlan: (id: string, body: Partial<PlanTemplateRecord>) =>
    request<{ plan: PlanTemplateRecord }>(`/api/admin/plans/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminDeletePlan: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/plans/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  adminListPayments: () => request<{ payments: PaymentRecord[] }>("/api/admin/payments"),
};
