import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type { Node } from "@prisma/client";

export function findNode<T extends Prisma.NodeFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.NodeFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.NodeGetPayload<T> | null> {
  return prisma.node.findUnique(args);
}

export function findFirstNode<T extends Prisma.NodeFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.NodeFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.NodeGetPayload<T> | null> {
  return prisma.node.findFirst(args);
}

export function findManyNodes<T extends Prisma.NodeFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.NodeFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.NodeGetPayload<T>>> {
  return prisma.node.findMany(args);
}

export function createNode<T extends Prisma.NodeCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.NodeCreateArgs>,
): Prisma.PrismaPromise<Prisma.NodeGetPayload<T>> {
  return prisma.node.create(args);
}

export function updateNode<T extends Prisma.NodeUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.NodeUpdateArgs>,
): Prisma.PrismaPromise<Prisma.NodeGetPayload<T>> {
  return prisma.node.update(args);
}

export function deleteNode<T extends Prisma.NodeDeleteArgs>(
  args: Prisma.SelectSubset<T, Prisma.NodeDeleteArgs>,
): Prisma.PrismaPromise<Prisma.NodeGetPayload<T>> {
  return prisma.node.delete(args);
}

export function countNodes(args?: Prisma.NodeCountArgs) {
  return prisma.node.count(args);
}
