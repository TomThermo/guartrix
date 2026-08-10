import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type ActivityEventWhereInput = Prisma.ActivityEventWhereInput;

export function findManyActivityEvents(args: Prisma.ActivityEventFindManyArgs) {
  return prisma.activityEvent.findMany(args);
}

export function countActivityEvents(args?: Prisma.ActivityEventCountArgs) {
  return prisma.activityEvent.count(args);
}
