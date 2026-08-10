import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export function findEmailVerificationToken<T extends Prisma.EmailVerificationTokenFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.EmailVerificationTokenFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.EmailVerificationTokenGetPayload<T> | null> {
  return prisma.emailVerificationToken.findUnique(args);
}

export function createEmailVerificationToken<T extends Prisma.EmailVerificationTokenCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.EmailVerificationTokenCreateArgs>,
): Prisma.PrismaPromise<Prisma.EmailVerificationTokenGetPayload<T>> {
  return prisma.emailVerificationToken.create(args);
}

export function deleteManyEmailVerificationTokens(
  args: Prisma.EmailVerificationTokenDeleteManyArgs,
) {
  return prisma.emailVerificationToken.deleteMany(args);
}

export function findPasswordResetToken<T extends Prisma.PasswordResetTokenFindUniqueArgs>(
  args: Prisma.SelectSubset<T, Prisma.PasswordResetTokenFindUniqueArgs>,
): Prisma.PrismaPromise<Prisma.PasswordResetTokenGetPayload<T> | null> {
  return prisma.passwordResetToken.findUnique(args);
}

export function createPasswordResetToken<T extends Prisma.PasswordResetTokenCreateArgs>(
  args: Prisma.SelectSubset<T, Prisma.PasswordResetTokenCreateArgs>,
): Prisma.PrismaPromise<Prisma.PasswordResetTokenGetPayload<T>> {
  return prisma.passwordResetToken.create(args);
}

export function deleteManyPasswordResetTokens(args: Prisma.PasswordResetTokenDeleteManyArgs) {
  return prisma.passwordResetToken.deleteMany(args);
}

export function findFirstSubUser<T extends Prisma.SubUserFindFirstArgs>(
  args?: Prisma.SelectSubset<T, Prisma.SubUserFindFirstArgs>,
): Prisma.PrismaPromise<Prisma.SubUserGetPayload<T> | null> {
  return prisma.subUser.findFirst(args);
}

export function updateSubUser<T extends Prisma.SubUserUpdateArgs>(
  args: Prisma.SelectSubset<T, Prisma.SubUserUpdateArgs>,
): Prisma.PrismaPromise<Prisma.SubUserGetPayload<T>> {
  return prisma.subUser.update(args);
}
