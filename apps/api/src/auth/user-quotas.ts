import type { UserRole } from "@guartrix/shared";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { hostTotalMemoryMb } from "../nodes/host-resources.js";

export type UserQuotas = {
  maxServers: number | null;
  maxMemoryMb: number | null;
  maxDatabases: number | null;
};

export type QuotaDefaults = {
  maxServers: number;
  maxMemoryMb: number;
  maxDatabases: number;
};

/** Panel admin create defaults when body omits quota fields. */
export const PANEL_CREATE_QUOTA_DEFAULTS: QuotaDefaults = {
  maxServers: 1,
  maxMemoryMb: 4096,
  maxDatabases: 3,
};

/** Application API create defaults when body omits quota fields. */
export const APPLICATION_CREATE_QUOTA_DEFAULTS: QuotaDefaults = {
  maxServers: 0,
  maxMemoryMb: 0,
  maxDatabases: 0,
};

/** Demotion / registration defaults from env. */
export function configQuotaDefaults(): QuotaDefaults {
  return {
    maxServers: Number.isFinite(config.defaultMaxServers)
      ? Math.max(0, config.defaultMaxServers)
      : 0,
    maxMemoryMb: Number.isFinite(config.defaultMaxMemoryMb)
      ? Math.max(0, config.defaultMaxMemoryMb)
      : 0,
    maxDatabases: Number.isFinite(config.defaultMaxDatabases)
      ? Math.max(0, config.defaultMaxDatabases)
      : 0,
  };
}

/** ADMIN accounts always store unlimited (null) quotas. */
export function quotasForCreate(
  role: UserRole,
  overrides: Partial<UserQuotas> | undefined,
  defaults: QuotaDefaults,
): UserQuotas {
  if (role === "ADMIN") {
    return { maxServers: null, maxMemoryMb: null, maxDatabases: null };
  }
  return {
    maxServers: overrides?.maxServers !== undefined ? overrides.maxServers : defaults.maxServers,
    maxMemoryMb:
      overrides?.maxMemoryMb !== undefined ? overrides.maxMemoryMb : defaults.maxMemoryMb,
    maxDatabases:
      overrides?.maxDatabases !== undefined ? overrides.maxDatabases : defaults.maxDatabases,
  };
}

/**
 * Apply role-change side effects onto a mutable Prisma update patch.
 * Returns an error string if demoting the last admin.
 */
export async function applyRoleChangeQuotas(opts: {
  existingRole: UserRole;
  nextRole: UserRole | undefined;
  data: Partial<UserQuotas>;
  demoteDefaults: QuotaDefaults;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { existingRole, nextRole, data, demoteDefaults } = opts;
  if (!nextRole) return { ok: true };

  if (nextRole === "ADMIN") {
    data.maxServers = null;
    data.maxMemoryMb = null;
    data.maxDatabases = null;
    return { ok: true };
  }

  if (existingRole === "ADMIN") {
    const blocked = await assertNotLastAdmin({ role: "ADMIN" });
    if (!blocked.ok) {
      return { ok: false, error: "Cannot demote the last admin" };
    }
    if (data.maxServers === undefined) data.maxServers = demoteDefaults.maxServers;
    if (data.maxMemoryMb === undefined) data.maxMemoryMb = demoteDefaults.maxMemoryMb;
    if (data.maxDatabases === undefined) {
      data.maxDatabases = demoteDefaults.maxDatabases;
    }
  }
  return { ok: true };
}

/** Shared display rule: ADMIN always surfaces as unlimited. */
export function displayQuotasForRole(role: UserRole, quotas: Partial<UserQuotas>): UserQuotas {
  if (role === "ADMIN") {
    return { maxServers: null, maxMemoryMb: null, maxDatabases: null };
  }
  return {
    maxServers: quotas.maxServers ?? null,
    maxMemoryMb: quotas.maxMemoryMb ?? null,
    maxDatabases: quotas.maxDatabases ?? null,
  };
}

/**
 * Refuse deleting/demoting when this would remove the last ADMIN.
 * Pass role of the target; only ADMIN targets are checked.
 */
export async function assertNotLastAdmin(opts: {
  role: UserRole;
  /** Optional custom error (e.g. GDPR self-delete wording). */
  error?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (opts.role !== "ADMIN") return { ok: true };
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins <= 1) {
    return {
      ok: false,
      error: opts.error ?? "Cannot delete the last admin",
    };
  }
  return { ok: true };
}

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const userRoleSchema = z.enum(["ADMIN", "OPERATOR", "VIEWER"]);

export const quotaLimitSchema = z.number().int().min(0).max(10_000).nullable().optional();

/** Wider cap for Application API body fields. */
export const applicationQuotaLimitSchema = z.number().int().min(0).max(100_000).nullable();

export function memoryQuotaSchema() {
  return z.number().int().min(0).max(hostTotalMemoryMb()).nullable().optional();
}
