import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export function findApplicationApiKey<T extends Prisma.ApplicationApiKeyFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.ApplicationApiKeyFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.ApplicationApiKeyGetPayload<T> | null> {
  return prisma.applicationApiKey.findUnique(args);
}

export function findManyApplicationApiKeys<T extends Prisma.ApplicationApiKeyFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.ApplicationApiKeyFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.ApplicationApiKeyGetPayload<T>>> {
  return prisma.applicationApiKey.findMany(args);
}

export function createApplicationApiKey<T extends Prisma.ApplicationApiKeyCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.ApplicationApiKeyCreateArgs>,
): Prisma.PrismaPromise<Prisma.ApplicationApiKeyGetPayload<T>> {
  return prisma.applicationApiKey.create(args);
}

export function updateApplicationApiKey<T extends Prisma.ApplicationApiKeyUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.ApplicationApiKeyUpdateArgs>,
): Prisma.PrismaPromise<Prisma.ApplicationApiKeyGetPayload<T>> {
  return prisma.applicationApiKey.update(args);
}

export function countApplicationApiKeys(args?: Prisma.ApplicationApiKeyCountArgs) {
  return prisma.applicationApiKey.count(args);
}
