import { beforeEach, describe, expect, it, vi } from "vitest";

const { mollieGetPayment } = vi.hoisted(() => ({
  mollieGetPayment: vi.fn(),
}));

const { prisma } = vi.hoisted(() => ({
  prisma: {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    billingSubscription: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { provisionPaidPayment, revokePlanAfterFailedRenewal, toPaymentRecord, emitBillingWebhook } =
  vi.hoisted(() => ({
    provisionPaidPayment: vi.fn(),
    revokePlanAfterFailedRenewal: vi.fn(),
    toPaymentRecord: vi.fn((row: unknown) => row),
    emitBillingWebhook: vi.fn(),
  }));

const { logActivity } = vi.hoisted(() => ({
  logActivity: vi.fn(),
}));

vi.mock("./mollie.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mollie.js")>();
  return {
    ...actual,
    mollieGetPayment,
  };
});

vi.mock("../db.js", () => ({ prisma }));

vi.mock("./billing.js", () => ({
  provisionPaidPayment,
  revokePlanAfterFailedRenewal,
  toPaymentRecord,
  emitBillingWebhook,
}));

vi.mock("../activity-log.js", () => ({ logActivity }));

import { syncMolliePayment } from "./billing-mollie-sync.js";

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    mollieId: "tr_1",
    userId: "user_1",
    planId: "plan_1",
    status: "PENDING",
    amountCents: 500,
    currency: "EUR",
    description: "Guartrix Pro",
    checkoutUrl: null,
    provisioned: false,
    provisionedAt: null,
    subscriptionId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: { slug: "pro", name: "Pro" },
    user: { username: "alice" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  toPaymentRecord.mockImplementation((row: unknown) => row);
});

describe("syncMolliePayment", () => {
  it("throws a clear, handled error for an unknown Mollie payment id", async () => {
    mollieGetPayment.mockResolvedValue({
      id: "tr_unknown",
      status: "open",
      amount: { currency: "EUR", value: "5.00" },
      description: "Unknown",
      metadata: {},
      subscriptionId: null,
    });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.billingSubscription.findFirst.mockResolvedValue(null);

    await expect(syncMolliePayment("tr_unknown")).rejects.toThrow(
      /Unknown Mollie payment tr_unknown/,
    );

    // No provisioning or quota side effects should run for an unresolved payment.
    expect(provisionPaidPayment).not.toHaveBeenCalled();
    expect(revokePlanAfterFailedRenewal).not.toHaveBeenCalled();
  });

  it("provisions the payment when Mollie reports it as paid", async () => {
    const row = paymentRow({ status: "PENDING", provisioned: false });
    const paidRow = { ...row, status: "PAID" };

    mollieGetPayment.mockResolvedValue({
      id: "tr_1",
      status: "paid",
      amount: { currency: "EUR", value: "5.00" },
      description: "Guartrix Pro",
      metadata: {},
      subscriptionId: null,
    });
    prisma.payment.findUnique.mockResolvedValue(row);
    prisma.payment.update.mockResolvedValue(paidRow);
    provisionPaidPayment.mockResolvedValue({
      already: false,
      payment: { ...paidRow, provisioned: true },
    });

    const result = await syncMolliePayment("tr_1");

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay_1" },
        data: { status: "PAID" },
      }),
    );
    expect(provisionPaidPayment).toHaveBeenCalledWith("pay_1");
    expect(result).toEqual({ ...paidRow, provisioned: true });

    // Paid transition (wasPaid=false → PAID) logs activity + emits the webhook.
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.paid" }));
    expect(emitBillingWebhook).toHaveBeenCalledWith(
      "payment.paid",
      expect.objectContaining({ payment: paidRow }),
    );
  });

  it("does not re-provision or re-log an already-paid payment", async () => {
    const row = paymentRow({ status: "PAID", provisioned: true });

    mollieGetPayment.mockResolvedValue({
      id: "tr_1",
      status: "paid",
      amount: { currency: "EUR", value: "5.00" },
      description: "Guartrix Pro",
      metadata: {},
      subscriptionId: null,
    });
    prisma.payment.findUnique.mockResolvedValue(row);
    prisma.payment.update.mockResolvedValue(row);

    const result = await syncMolliePayment("tr_1");

    expect(provisionPaidPayment).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "billing.paid" }),
    );
    expect(result).toEqual(row);
  });

  it("revokes plan access on a failed renewal payment", async () => {
    const row = paymentRow({
      status: "PENDING",
      subscriptionId: "sub_1",
      metadata: JSON.stringify({ renewal: true }),
    });
    const failedRow = { ...row, status: "FAILED" };

    mollieGetPayment.mockResolvedValue({
      id: "tr_1",
      status: "failed",
      amount: { currency: "EUR", value: "5.00" },
      description: "Guartrix renewal",
      metadata: {},
      subscriptionId: "msub_1",
    });
    prisma.payment.findUnique.mockResolvedValue(row);
    prisma.payment.update.mockResolvedValue(failedRow);

    const result = await syncMolliePayment("tr_1");

    expect(revokePlanAfterFailedRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        paymentId: "pay_1",
        subscriptionId: "sub_1",
        status: "FAILED",
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "billing.failed", success: false }),
    );
    expect(result).toEqual(failedRow);
  });
});
