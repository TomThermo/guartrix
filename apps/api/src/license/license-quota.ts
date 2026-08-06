import {
  UNLICENSED_MAX_DISK_MB,
  UNLICENSED_MAX_MEMORY_MB,
  UNLICENSED_MAX_NODES,
  UNLICENSED_MAX_SERVERS,
} from "@msm/shared/license-ticket";
import { prisma } from "../db.js";
import { processManager } from "../servers/process-manager.js";
import { validateLicense } from "./license-validate.js";
import type { LicenseState } from "./license-validate.js";

/**
 * Unlicensed / invalid license free tier for this install.
 * One node, one Minecraft server, 10 GB disk — enough to evaluate the panel.
 */
export { UNLICENSED_MAX_NODES, UNLICENSED_MAX_SERVERS, UNLICENSED_MAX_DISK_MB, UNLICENSED_MAX_MEMORY_MB };

export function getUnlicensedFreeTier(): {
  maxNodes: number;
  maxServers: number;
  maxDiskMb: number;
  maxMemoryMb: number;
} {
  return {
    maxNodes: UNLICENSED_MAX_NODES,
    maxServers: UNLICENSED_MAX_SERVERS,
    maxDiskMb: UNLICENSED_MAX_DISK_MB,
    maxMemoryMb: UNLICENSED_MAX_MEMORY_MB,
  };
}

function licenseQuotaError(message: string): Error & { code?: string } {
  const err = new Error(message) as Error & { code?: string };
  err.code = "LICENSE_QUOTA";
  return err;
}

/** Stop running servers that exceed unlicensed free-tier caps. */
export async function enforceUnlicensedFreeTier(reason: string): Promise<number> {
  const servers = await prisma.server.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      diskMb: true,
      status: true,
    },
  });
  const active = new Set(["RUNNING", "STARTING", "STOPPING"]);
  const keepIds = new Set(
    servers.slice(0, UNLICENSED_MAX_SERVERS).map((s) => s.id),
  );
  let n = 0;
  for (const s of servers) {
    const overDisk = s.diskMb <= 0 || s.diskMb > UNLICENSED_MAX_DISK_MB;
    const excess = !keepIds.has(s.id);
    if (!(overDisk || excess) || !active.has(s.status)) continue;
    try {
      await processManager.stop(s.id);
      n += 1;
      console.warn(
        `[license] Stopped ${s.name} (${s.id}): unlicensed free tier (${reason})`,
      );
    } catch (err) {
      console.warn(
        `[license] failed to stop free-tier over ${s.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (n > 0) {
    console.warn(
      `[license] Stopped ${n} game server(s) for unlicensed free tier: ${reason}`,
    );
  }
  return n;
}

/** Stop running servers that exceed per-server or total license RAM caps. */
export async function stopServersExceedingLicenseQuota(
  state: LicenseState,
): Promise<number> {
  const maxPer = state.maxMemoryMbPerServer ?? null;
  const maxTotal = state.maxMemoryMb ?? null;
  if (maxPer == null && maxTotal == null) return 0;

  const servers = await prisma.server.findMany({
    select: { id: true, name: true, memoryMb: true, status: true },
  });
  const active = new Set(["RUNNING", "STARTING", "STOPPING"]);
  let n = 0;

  if (maxPer != null) {
    for (const s of servers) {
      if (!active.has(s.status) || s.memoryMb <= maxPer) continue;
      try {
        await processManager.stop(s.id);
        n += 1;
        console.warn(
          `[license] Stopped ${s.name} (${s.id}): ${formatLicenseRam(s.memoryMb)} exceeds license max ${formatLicenseRam(maxPer)}/server`,
        );
      } catch (err) {
        console.warn(
          `[license] failed to stop over-quota ${s.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  if (maxTotal != null) {
    const refreshed = await prisma.server.findMany({
      select: { id: true, name: true, memoryMb: true, status: true },
    });
    const running = refreshed.filter((s) => active.has(s.status));
    let used = running.reduce((sum, s) => sum + s.memoryMb, 0);
    if (used > maxTotal) {
      // Stop largest first until under the pool
      const ordered = [...running].sort((a, b) => b.memoryMb - a.memoryMb);
      for (const s of ordered) {
        if (used <= maxTotal) break;
        try {
          await processManager.stop(s.id);
          used -= s.memoryMb;
          n += 1;
          console.warn(
            `[license] Stopped ${s.name} (${s.id}): panel RAM over license pool ${formatLicenseRam(maxTotal)}`,
          );
        } catch (err) {
          console.warn(
            `[license] failed to stop pool-over ${s.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  return n;
}

/** Shown when start is blocked because free-tier caps are exceeded. */
export const LICENSE_POWER_BLOCKED_MESSAGE =
  "ERROR: Cannot start — panel license expired or invalid, and this install is over the free tier (1 server, 10 GB disk). Please contact your administrator.";

export const LICENSE_POWER_BLOCKED_CODE = "LICENSE_INVALID";

export async function assertLicenseAllowsPower(): Promise<void> {
  // Force a fresh check on power actions so revoke/expiry applies immediately
  // (not only after the 5-minute cache window).
  const state = await validateLicense(true);
  if (state.valid) return;
  // Unlicensed free tier may still start the single allowed server.
  const usage = await getPanelServerUsage();
  if (usage.serverCount > UNLICENSED_MAX_SERVERS) {
    const err = new Error(LICENSE_POWER_BLOCKED_MESSAGE) as Error & {
      code?: string;
    };
    err.code = LICENSE_POWER_BLOCKED_CODE;
    throw err;
  }
}

/**
 * Every Minecraft JVM start must go through here so license/quota cannot be
 * skipped via backup restore, transfer, or scheduled restart.
 */
export async function startServerIfLicensed(serverId: string): Promise<void> {
  await assertLicenseAllowsPower();
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, memoryMb: true, diskMb: true, suspended: true },
  });
  if (!server) throw new Error("Server not found");
  if (server.suspended) {
    const err = new Error(
      "Server is suspended — contact support or renew your plan",
    ) as Error & { code?: string };
    err.code = "SERVER_SUSPENDED";
    throw err;
  }
  await assertLicensePanelQuota(server.memoryMb, {
    excludeServerId: server.id,
  });
  await assertLicenseDiskQuota(server.diskMb);
  await processManager.start(serverId);
}

/** Panel-wide usage (all Minecraft servers on this install). */
export async function getPanelServerUsage(): Promise<{
  serverCount: number;
  memoryUsedMb: number;
  /** Highest memoryMb among servers (0 if none). */
  maxServerMemoryMb: number;
  nodeCount: number;
}> {
  const [servers, nodeCount] = await Promise.all([
    prisma.server.findMany({
      select: { memoryMb: true },
    }),
    prisma.node.count(),
  ]);
  return {
    serverCount: servers.length,
    memoryUsedMb: servers.reduce((sum, s) => sum + s.memoryMb, 0),
    maxServerMemoryMb: servers.reduce((m, s) => Math.max(m, s.memoryMb), 0),
    nodeCount,
  };
}

/**
 * Enforce license product caps (panel-wide). Admins are also subject to these —
 * the license is the commercial ceiling for the install.
 *
 * - create / clone / import: `{ extraServer: true }`
 * - resize / start / restart: `{ excludeServerId: server.id }` (counts this server’s RAM)
 */
function formatLicenseRam(mb: number): string {
  if (mb % 1024 === 0) return `${mb / 1024} GB`;
  const gb = Math.round((mb / 1024) * 1000) / 1000;
  return `${gb} GB (${mb} MB)`;
}

/** Block adding a daemon node when the license maxNodes ceiling is reached. */
export async function assertLicenseNodeQuota(): Promise<void> {
  const state = await validateLicense(false);
  const nodeCount = await prisma.node.count();
  if (!state.valid) {
    if (nodeCount >= UNLICENSED_MAX_NODES) {
      throw licenseQuotaError(
        `Without a valid license, this panel allows ${UNLICENSED_MAX_NODES} node (currently ${nodeCount}). Activate a license to add more.`,
      );
    }
    return;
  }
  const maxNodes = state.maxNodes ?? null;
  if (maxNodes == null) return;
  if (nodeCount >= maxNodes) {
    throw licenseQuotaError(
      `License node limit reached (${nodeCount}/${maxNodes}). Upgrade the license or remove a node.`,
    );
  }
}

/**
 * Disk ceiling from licensing. Licensed installs have no product disk cap yet;
 * unlicensed free tier caps each server at 10 GB (unlimited `diskMb <= 0` blocked).
 */
export async function assertLicenseDiskQuota(diskMb: number): Promise<void> {
  const state = await validateLicense(false);
  if (state.valid) return;
  if (diskMb <= 0 || diskMb > UNLICENSED_MAX_DISK_MB) {
    throw licenseQuotaError(
      `Without a valid license, disk is limited to ${UNLICENSED_MAX_DISK_MB / 1024} GB per server.`,
    );
  }
}

export async function assertLicensePanelQuota(
  memoryMb: number,
  opts: { excludeServerId?: string; extraServer?: boolean } = {
    extraServer: true,
  },
): Promise<void> {
  // Prefer fresh cache after power actions (assertLicenseAllowsPower force-validates).
  const state = await validateLicense(false);

  const servers = await prisma.server.findMany({
    select: { id: true, memoryMb: true },
  });

  const others = opts.excludeServerId
    ? servers.filter((s) => s.id !== opts.excludeServerId)
    : [...servers];

  const serverCountAfter = opts.extraServer
    ? others.length + 1
    : opts.excludeServerId
      ? servers.length
      : others.length + 1;

  if (!state.valid) {
    if (opts.extraServer && serverCountAfter > UNLICENSED_MAX_SERVERS) {
      throw licenseQuotaError(
        `Without a valid license, this panel allows ${UNLICENSED_MAX_SERVERS} Minecraft server (currently ${servers.length}). Activate a license to add more.`,
      );
    }
    if (!opts.extraServer && servers.length > UNLICENSED_MAX_SERVERS) {
      throw licenseQuotaError(
        `Without a valid license, this panel allows ${UNLICENSED_MAX_SERVERS} Minecraft server (currently ${servers.length}). Delete extra servers or activate a license.`,
      );
    }
    const usedOther = others.reduce((sum, s) => sum + s.memoryMb, 0);
    if (usedOther + memoryMb > UNLICENSED_MAX_MEMORY_MB) {
      throw licenseQuotaError(
        `Without a valid license, total RAM is limited to ${UNLICENSED_MAX_MEMORY_MB / 1024} GB (request would use ${(usedOther + memoryMb) / 1024} GB).`,
      );
    }
    return;
  }

  const maxServers = state.maxServers ?? null;
  const maxMemoryMb = state.maxMemoryMb ?? null;
  const maxPerServer = state.maxMemoryMbPerServer ?? null;

  if (maxPerServer != null && memoryMb > maxPerServer) {
    throw licenseQuotaError(
      `License allows at most ${formatLicenseRam(maxPerServer)} RAM per Minecraft server (this server is set to ${formatLicenseRam(memoryMb)}). Lower Memory in server settings, then try again.`,
    );
  }

  if (maxServers == null && maxMemoryMb == null) return;

  const memoryAfter =
    others.reduce((sum, s) => sum + s.memoryMb, 0) + memoryMb;

  if (maxServers != null && opts.extraServer && serverCountAfter > maxServers) {
    throw licenseQuotaError(
      `License server limit reached (${servers.length}/${maxServers}).`,
    );
  }
  if (maxMemoryMb != null && memoryAfter > maxMemoryMb) {
    throw licenseQuotaError(
      `License RAM pool exceeded: need ${formatLicenseRam(memoryAfter)} total, license allows ${formatLicenseRam(maxMemoryMb)}.`,
    );
  }
}
