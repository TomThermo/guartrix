import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export type { User } from "@prisma/client";

export function findUser<T extends Prisma.UserFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.UserGetPayload<T> | null> {
  return prisma.user.findUnique(args);
}

export function findManyUsers<T extends Prisma.UserFindManyArgs>(
  args?: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>,
): Prisma.PrismaPromise<Array<Prisma.UserGetPayload<T>>> {
  return prisma.user.findMany(args);
}

export function createUser<T extends Prisma.UserCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>,
): Prisma.PrismaPromise<Prisma.UserGetPayload<T>> {
  return prisma.user.create(args);
}

export function updateUser<T extends Prisma.UserUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>,
): Prisma.PrismaPromise<Prisma.UserGetPayload<T>> {
  return prisma.user.update(args);
}

export function deleteUser<T extends Prisma.UserDeleteArgs>(
  args: Prisma.SelectSubset<T, Prisma.UserDeleteArgs>,
): Prisma.PrismaPromise<Prisma.UserGetPayload<T>> {
  return prisma.user.delete(args);
}

export function countUsers(args?: Prisma.UserCountArgs) {
  return prisma.user.count(args);
}

export function findUserByUsernameInsensitive(username: string) {
  return prisma.$queryRaw<Array<{ id: string; username: string; passwordHash: string; role: string }>>`
    SELECT id, username, passwordHash, role FROM User
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `;
}
