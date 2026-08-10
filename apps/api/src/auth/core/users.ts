import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AuthUser, UserRole } from "@guartrix/shared";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { hashPassword } from "../password-hash.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyMessage,
  strongPasswordRefine,
} from "../password-policy.js";
import { displayQuotasForRole } from "../user-quotas.js";

export async function findUserByUsernameInsensitive(username: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM User WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByEmailInsensitive(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM User WHERE email IS NOT NULL AND LOWER(email) = ${normalized} LIMIT 1
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine(strongPasswordRefine, { message: passwordPolicyMessage() });

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function panelBaseUrl(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

/** Roles that must have TOTP enabled (TWO_FACTOR_REQUIRED_ROLES). */
export function roleRequiresTwoFactor(role: UserRole): boolean {
  return config.twoFactorRequiredRoles.includes(role);
}

export function toAuthUser(
  user: {
    id: string;
    username: string;
    role: UserRole;
    createdAt: Date;
    maxServers?: number | null;
    maxMemoryMb?: number | null;
    maxDatabases?: number | null;
    totpEnabled?: boolean;
  },
  opts?: {
    serverCount?: number;
    memoryUsedMb?: number;
    databaseCount?: number;
  },
): AuthUser {
  const quotas = displayQuotasForRole(user.role, {
    maxServers: user.maxServers,
    maxMemoryMb: user.maxMemoryMb,
    maxDatabases: user.maxDatabases,
  });
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: Boolean(user.totpEnabled),
    twoFactorRequired: roleRequiresTwoFactor(user.role),
    maxServers: quotas.maxServers,
    maxMemoryMb: quotas.maxMemoryMb,
    maxDatabases: quotas.maxDatabases,
    ...(opts?.serverCount !== undefined ? { serverCount: opts.serverCount } : {}),
    ...(opts?.memoryUsedMb !== undefined ? { memoryUsedMb: opts.memoryUsedMb } : {}),
    ...(opts?.databaseCount !== undefined ? { databaseCount: opts.databaseCount } : {}),
  };
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const count = await prisma.user.count();
  if (count === 0) {
    await prisma.user.create({
      data: {
        id: nanoid(12),
        username: "admin",
        passwordHash: hashPassword(config.adminPassword),
        role: "ADMIN",
        emailVerified: true,
      },
    });
  }

  // Assign orphan servers to the first admin so ownership is always defined
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) {
    await prisma.server.updateMany({
      where: { ownerId: null },
      data: { ownerId: admin.id },
    });
  }
}
