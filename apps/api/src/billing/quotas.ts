import type { AuthUser, UserRole } from "@guartrix/shared";
import { prisma } from "../db.js";

export type QuotaUser = {
  id: string;
  role: UserRole;
  maxServers: number | null;
  maxMemoryMb: number | null;
  maxDatabases: number | null;
};

export async function getOwnerUsage(ownerId: string): Promise<{
  serverCount: number;
  memoryUsedMb: number;
  databaseCount: number;
}> {
  const servers = await prisma.server.findMany({
    where: { ownerId },
    select: { memoryMb: true, id: true },
  });
  const databaseCount = await prisma.database.count({
    where: { server: { ownerId } },
  });
  return {
    serverCount: servers.length,
    memoryUsedMb: servers.reduce((sum, s) => sum + s.memoryMb, 0),
    databaseCount,
  };
}

/** Admins ignore quotas. null limit = unlimited. */
export function isUnlimited(user: QuotaUser): boolean {
  return user.role === "ADMIN";
}

export async function assertCanCreateServer(
  user: QuotaUser,
  memoryMb: number,
  opts?: { diskMb?: number },
): Promise<void> {
  const { assertLicensePanelQuota, assertLicenseDiskQuota } = await import("../license/license.js");
  await assertLicensePanelQuota(memoryMb, { extraServer: true });
  // Default provision disk is 10 GB when omitted.
  await assertLicenseDiskQuota(opts?.diskMb ?? 10_240);

  if (isUnlimited(user)) return;

  const usage = await getOwnerUsage(user.id);

  if (user.maxServers != null && usage.serverCount >= user.maxServers) {
    if (user.maxServers === 0) {
      throw new Error("No server plan on this account.");
    }
    throw new Error(`Server limit reached (${usage.serverCount}/${user.maxServers}).`);
  }

  if (user.maxMemoryMb != null) {
    if (memoryMb > user.maxMemoryMb) {
      throw new Error(
        `This server needs ${memoryMb} MB RAM but your account RAM pool is ${user.maxMemoryMb} MB (node capacity is separate — ask an admin to raise your pool).`,
      );
    }
    const next = usage.memoryUsedMb + memoryMb;
    if (next > user.maxMemoryMb) {
      throw new Error(
        `Account RAM pool exceeded: ${usage.memoryUsedMb} MB in use + ${memoryMb} MB = ${next} MB (limit ${user.maxMemoryMb} MB).`,
      );
    }
  }
}

/**
 * Changing memory on an existing server, or transferring ownership.
 * `excludeServerId` memory is not counted in current usage (replaced by memoryMb).
 */
export async function assertCanAllocateMemory(
  user: QuotaUser,
  memoryMb: number,
  opts?: {
    excludeServerId?: string;
    extraServer?: boolean;
    diskMb?: number;
  },
): Promise<void> {
  const { assertLicensePanelQuota, assertLicenseDiskQuota } = await import("../license/license.js");
  await assertLicensePanelQuota(memoryMb, {
    excludeServerId: opts?.excludeServerId,
    extraServer: opts?.extraServer ?? false,
  });
  if (opts?.diskMb !== undefined) {
    await assertLicenseDiskQuota(opts.diskMb);
  }

  if (isUnlimited(user)) return;

  const servers = await prisma.server.findMany({
    where: { ownerId: user.id },
    select: { id: true, memoryMb: true },
  });

  let serverCount = servers.length;
  let memoryUsedMb = 0;
  for (const s of servers) {
    if (opts?.excludeServerId && s.id === opts.excludeServerId) continue;
    memoryUsedMb += s.memoryMb;
  }

  if (opts?.extraServer) {
    serverCount += 1;
    if (user.maxServers != null && serverCount > user.maxServers) {
      if (user.maxServers === 0) {
        throw new Error("No server plan on this account.");
      }
      throw new Error(`Server limit reached (${servers.length}/${user.maxServers}).`);
    }
  }

  if (user.maxMemoryMb != null) {
    if (memoryMb > user.maxMemoryMb) {
      throw new Error(
        `This server needs ${memoryMb} MB RAM but your account RAM pool is ${user.maxMemoryMb} MB (node capacity is separate — ask an admin to raise your pool).`,
      );
    }
    const next = memoryUsedMb + memoryMb;
    if (next > user.maxMemoryMb) {
      throw new Error(
        `Account RAM pool exceeded: ${memoryUsedMb} MB in use + ${memoryMb} MB = ${next} MB (limit ${user.maxMemoryMb} MB).`,
      );
    }
  }
}

export async function assertCanCreateDatabase(user: QuotaUser): Promise<void> {
  if (isUnlimited(user)) return;
  if (user.maxDatabases == null) return;

  const usage = await getOwnerUsage(user.id);
  if (usage.databaseCount >= user.maxDatabases) {
    throw new Error(
      `Database limit reached (${usage.databaseCount}/${user.maxDatabases}). Ask an admin to raise your limit.`,
    );
  }
}

export function formatQuotaLabel(user: AuthUser): string {
  const servers =
    user.maxServers == null ? "∞ servers" : `${user.serverCount ?? 0}/${user.maxServers} servers`;
  const ram =
    user.maxMemoryMb == null
      ? "∞ RAM"
      : `${Math.round((user.memoryUsedMb ?? 0) / 1024)}/${Math.round(user.maxMemoryMb / 1024)} GB RAM`;
  const dbs =
    user.maxDatabases == null ? "∞ DBs" : `${user.databaseCount ?? 0}/${user.maxDatabases} DBs`;
  return `${servers} · ${ram} · ${dbs}`;
}
