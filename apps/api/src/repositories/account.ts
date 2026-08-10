import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export function findApiKey<T extends Prisma.ApiKeyFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.ApiKeyFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.ApiKeyGetPayload<T> | null> {
  return prisma.apiKey.findUnique(args);
}

export function findFirstApiKey<T extends Prisma.ApiKeyFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.ApiKeyFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.ApiKeyGetPayload<T> | null> {
  return prisma.apiKey.findFirst(args);
}

export function findManyApiKeys<T extends Prisma.ApiKeyFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.ApiKeyFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.ApiKeyGetPayload<T>>> {
  return prisma.apiKey.findMany(args);
}

export function createApiKey<T extends Prisma.ApiKeyCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.ApiKeyCreateArgs>,
): Prisma.PrismaPromise<Prisma.ApiKeyGetPayload<T>> {
  return prisma.apiKey.create(args);
}

export function updateApiKey<T extends Prisma.ApiKeyUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.ApiKeyUpdateArgs>,
): Prisma.PrismaPromise<Prisma.ApiKeyGetPayload<T>> {
  return prisma.apiKey.update(args);
}

export function countApiKeys(args?: Prisma.ApiKeyCountArgs) {
  return prisma.apiKey.count(args);
}

export function findAppPassword<T extends Prisma.AppPasswordFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.AppPasswordFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.AppPasswordGetPayload<T> | null> {
  return prisma.appPassword.findUnique(args);
}

export function findFirstAppPassword<T extends Prisma.AppPasswordFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.AppPasswordFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.AppPasswordGetPayload<T> | null> {
  return prisma.appPassword.findFirst(args);
}

export function findManyAppPasswords<T extends Prisma.AppPasswordFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.AppPasswordFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.AppPasswordGetPayload<T>>> {
  return prisma.appPassword.findMany(args);
}

export function createAppPassword<T extends Prisma.AppPasswordCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.AppPasswordCreateArgs>,
): Prisma.PrismaPromise<Prisma.AppPasswordGetPayload<T>> {
  return prisma.appPassword.create(args);
}

export function updateAppPassword<T extends Prisma.AppPasswordUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.AppPasswordUpdateArgs>,
): Prisma.PrismaPromise<Prisma.AppPasswordGetPayload<T>> {
  return prisma.appPassword.update(args);
}

export function countAppPasswords(args?: Prisma.AppPasswordCountArgs) {
  return prisma.appPassword.count(args);
}

export function findPushSubscription<T extends Prisma.PushSubscriptionFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.PushSubscriptionFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.PushSubscriptionGetPayload<T> | null> {
  return prisma.pushSubscription.findUnique(args);
}

export function findManyPushSubscriptions<T extends Prisma.PushSubscriptionFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.PushSubscriptionFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.PushSubscriptionGetPayload<T>>> {
  return prisma.pushSubscription.findMany(args);
}

export function createPushSubscription<T extends Prisma.PushSubscriptionCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.PushSubscriptionCreateArgs>,
): Prisma.PrismaPromise<Prisma.PushSubscriptionGetPayload<T>> {
  return prisma.pushSubscription.create(args);
}

export function updatePushSubscription<T extends Prisma.PushSubscriptionUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.PushSubscriptionUpdateArgs>,
): Prisma.PrismaPromise<Prisma.PushSubscriptionGetPayload<T>> {
  return prisma.pushSubscription.update(args);
}

export function deleteManyPushSubscriptions(args: Prisma.PushSubscriptionDeleteManyArgs) {
  return prisma.pushSubscription.deleteMany(args);
}

export function countPushSubscriptions(args?: Prisma.PushSubscriptionCountArgs) {
  return prisma.pushSubscription.count(args);
}
