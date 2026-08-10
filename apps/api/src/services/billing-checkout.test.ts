import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@guartrix/shared";

const { mollieConfigured, mollieCreateCustomer, mollieCreatePayment, mollieCheckoutUrl } =
  vi.hoisted(() => ({
    mollieConfigured: vi.fn(),
    mollieCreateCustomer: vi.fn(),
    mollieCreatePayment: vi.fn(),
    mollieCheckoutUrl: vi.fn(),
  }));

const { findPlanTemplate, createPayment, createBillingSubscription } = vi.hoisted(() => ({
  findPlanTemplate: vi.fn(),
  createPayment: vi.fn(),
  createBillingSubscription: vi.fn(),
}));

const { findUser, updateUser } = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../billing/mollie.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../billing/mollie.js")>();
  return {
    ...actual,
    mollieConfigured,
    mollieCreateCustomer,
    mollieCreatePayment,
    mollieCheckoutUrl,
  };
});

vi.mock("./billing.js", () => ({
  findPlanTemplate,
  createPayment,
  createBillingSubscription,
}));

vi.mock("./users.js", () => ({ findUser, updateUser }));

vi.mock("../routes/billing/serialize.js", () => ({
  panelBase: () => "http://127.0.0.1:8080",
  safeBillingRedirectUrl: (_url: string | undefined, paymentId: string) =>
    `http://127.0.0.1:8080/billing/return?payment=${paymentId}`,
}));

import { createBillingCheckout } from "./billing-checkout.js";

const operator: AuthUser = {
  id: "u1",
  username: "alice",
  role: "OPERATOR",
  email: "alice@example.com",
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorRequired: false,
  maxServers: 0,
  maxMemoryMb: 0,
  maxDatabases: 0,
  serverCount: 0,
  memoryUsedMb: 0,
  databaseCount: 0,
};

const request = {} as import("fastify").FastifyRequest;

const plan = {
  id: "plan_1",
  slug: "pro",
  name: "Pro",
  enabled: true,
  priceCents: 500,
  currency: "EUR",
  recurringInterval: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mollieConfigured.mockReturnValue(true);
  findPlanTemplate.mockResolvedValue(plan);
  findUser.mockResolvedValue({ id: "u1", email: "alice@example.com", mollieCustomerId: null });
  mollieCreatePayment.mockResolvedValue({
    id: "tr_test",
    status: "open",
    amount: { currency: "EUR", value: "5.00" },
    _links: { checkout: { href: "https://mollie.test/pay/tr_test" } },
  });
  mollieCheckoutUrl.mockReturnValue("https://mollie.test/pay/tr_test");
  createPayment.mockResolvedValue({
    id: "pay_local",
    mollieId: "tr_test",
    plan,
    user: { username: "alice" },
  });
});

describe("createBillingCheckout", () => {
  it("returns 503 when Mollie is not configured", async () => {
    mollieConfigured.mockReturnValue(false);
    const result = await createBillingCheckout(operator, { planSlug: "pro" }, request);
    expect(result).toEqual({
      error: "Mollie is not configured (set MOLLIE_API_KEY)",
      status: 503,
    });
  });

  it("rejects admin checkout", async () => {
    const result = await createBillingCheckout(
      { ...operator, role: "ADMIN" },
      { planSlug: "pro" },
      request,
    );
    expect(result).toEqual({
      error: "Admins already have unlimited quotas",
      status: 400,
    });
  });

  it("returns 404 for unknown plan", async () => {
    findPlanTemplate.mockResolvedValue(null);
    const result = await createBillingCheckout(operator, { planSlug: "missing" }, request);
    expect(result).toEqual({ error: "Plan not found", status: 404 });
  });

  it("returns checkout URL on success", async () => {
    const result = await createBillingCheckout(operator, { planSlug: "pro" }, request);
    expect("checkoutUrl" in result).toBe(true);
    if ("checkoutUrl" in result) {
      expect(result.checkoutUrl).toBe("https://mollie.test/pay/tr_test");
      expect(result.payment.id).toBe("pay_local");
      expect(result.activity.planSlug).toBe("pro");
    }
    expect(mollieCreatePayment).toHaveBeenCalledOnce();
    expect(createPayment).toHaveBeenCalledOnce();
  });
});
