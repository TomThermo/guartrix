import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type { Server } from "@prisma/client";

export function findServer<T extends Prisma.ServerFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.ServerFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.ServerGetPayload<T> | null> {
  return prisma.server.findUnique(args);
}

export function findServerOrThrow<T extends Prisma.ServerFindUniqueOrThrowArgs>(
  args: Prisma.SelectSubset<T, Prisma.ServerFindUniqueOrThrowArgs>,
): Prisma.PrismaPromise<Prisma.ServerGetPayload<T>> {
  return prisma.server.findUniqueOrThrow(args);
}

export function findFirstServer<T extends Prisma.ServerFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.ServerFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.ServerGetPayload<T> | null> {
  return prisma.server.findFirst(args);
}

export function findManyServers<T extends Prisma.ServerFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.ServerFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.ServerGetPayload<T>>> {
  return prisma.server.findMany(args);
}

export function createServer<T extends Prisma.ServerCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.ServerCreateArgs>,
): Prisma.PrismaPromise<Prisma.ServerGetPayload<T>> {
  return prisma.server.create(args);
}

export function updateServer<T extends Prisma.ServerUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.ServerUpdateArgs>,
): Prisma.PrismaPromise<Prisma.ServerGetPayload<T>> {
  return prisma.server.update(args);
}

export function updateManyServers(args: Prisma.ServerUpdateManyArgs) {
  return prisma.server.updateMany(args);
}

export function deleteServer<T extends Prisma.ServerDeleteArgs>(
  args: Prisma.SelectSubset<T, Prisma.ServerDeleteArgs>,
): Prisma.PrismaPromise<Prisma.ServerGetPayload<T>> {
  return prisma.server.delete(args);
}

export function countServers(args?: Prisma.ServerCountArgs) {
  return prisma.server.count(args);
}
