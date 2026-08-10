import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type { Allocation } from "@prisma/client";
export type AllocationWithServerName = Prisma.AllocationGetPayload<{
  include: { server: { select: { name: true } } };
}>;

const allocationWithServerInclude = { server: { select: { name: true } } } as const;

export function findAllocation<T extends Prisma.AllocationFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.AllocationFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.AllocationGetPayload<T> | null> {
  return prisma.allocation.findUnique(args);
}

export function findFirstAllocation<T extends Prisma.AllocationFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.AllocationFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.AllocationGetPayload<T> | null> {
  return prisma.allocation.findFirst(args);
}

export function findManyAllocations<T extends Prisma.AllocationFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.AllocationFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.AllocationGetPayload<T>>> {
  return prisma.allocation.findMany(args);
}

export function createAllocation<T extends Prisma.AllocationCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.AllocationCreateArgs>,
): Prisma.PrismaPromise<Prisma.AllocationGetPayload<T>> {
  return prisma.allocation.create(args);
}

export function updateAllocation<T extends Prisma.AllocationUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.AllocationUpdateArgs>,
): Prisma.PrismaPromise<Prisma.AllocationGetPayload<T>> {
  return prisma.allocation.update(args);
}

export function updateManyAllocations(args: Prisma.AllocationUpdateManyArgs) {
  return prisma.allocation.updateMany(args);
}

export function deleteAllocation<T extends Prisma.AllocationDeleteArgs>(
  args: Prisma.SelectSubset<T, Prisma.AllocationDeleteArgs>,
): Prisma.PrismaPromise<Prisma.AllocationGetPayload<T>> {
  return prisma.allocation.delete(args);
}

export function promotePrimaryAllocationTransaction(
  serverId: string,
  allocationId: string,
  newPort: number,
) {
  return prisma.$transaction([
    prisma.allocation.updateMany({
      where: { serverId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.allocation.update({
      where: { id: allocationId },
      data: { isPrimary: true },
    }),
    prisma.server.update({
      where: { id: serverId },
      data: { port: newPort },
    }),
  ]);
}

export { allocationWithServerInclude };
