import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export function findPlanTemplate<T extends Prisma.PlanTemplateFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.PlanTemplateFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.PlanTemplateGetPayload<T> | null> {
  return prisma.planTemplate.findUnique(args);
}

export function findManyPlanTemplates<T extends Prisma.PlanTemplateFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.PlanTemplateFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.PlanTemplateGetPayload<T>>> {
  return prisma.planTemplate.findMany(args);
}

export function createPlanTemplate<T extends Prisma.PlanTemplateCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.PlanTemplateCreateArgs>,
): Prisma.PrismaPromise<Prisma.PlanTemplateGetPayload<T>> {
  return prisma.planTemplate.create(args);
}

export function updatePlanTemplate<T extends Prisma.PlanTemplateUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.PlanTemplateUpdateArgs>,
): Prisma.PrismaPromise<Prisma.PlanTemplateGetPayload<T>> {
  return prisma.planTemplate.update(args);
}

export function deletePlanTemplate<T extends Prisma.PlanTemplateDeleteArgs>(
  args: Prisma.SelectSubset<T, Prisma.PlanTemplateDeleteArgs>,
): Prisma.PrismaPromise<Prisma.PlanTemplateGetPayload<T>> {
  return prisma.planTemplate.delete(args);
}

export function findPayment<T extends Prisma.PaymentFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.PaymentFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.PaymentGetPayload<T> | null> {
  return prisma.payment.findFirst(args);
}

export function findManyPayments<T extends Prisma.PaymentFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.PaymentFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.PaymentGetPayload<T>>> {
  return prisma.payment.findMany(args);
}

export function createPayment<T extends Prisma.PaymentCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.PaymentCreateArgs>,
): Prisma.PrismaPromise<Prisma.PaymentGetPayload<T>> {
  return prisma.payment.create(args);
}

export function findFirstBillingSubscription<T extends Prisma.BillingSubscriptionFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.BillingSubscriptionFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.BillingSubscriptionGetPayload<T> | null> {
  return prisma.billingSubscription.findFirst(args);
}

export function findBillingSubscription<T extends Prisma.BillingSubscriptionFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.BillingSubscriptionFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.BillingSubscriptionGetPayload<T> | null> {
  return prisma.billingSubscription.findUnique(args);
}

export function findManyBillingSubscriptions<T extends Prisma.BillingSubscriptionFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.BillingSubscriptionFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.BillingSubscriptionGetPayload<T>>> {
  return prisma.billingSubscription.findMany(args);
}

export function createBillingSubscription<T extends Prisma.BillingSubscriptionCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.BillingSubscriptionCreateArgs>,
): Prisma.PrismaPromise<Prisma.BillingSubscriptionGetPayload<T>> {
  return prisma.billingSubscription.create(args);
}
