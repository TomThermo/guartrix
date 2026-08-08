/**
 * Disk quota helpers: check before writes; stop when over while running.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { serverDir } from "./config.js";
import { getDiskUsageCached, peekDiskUsage, invalidateDiskUsage } from "./disk-usage.js";

export type ServerLimits = {
  /** 0 = unlimited disk */
  diskMb: number;
  /** 0 = unlimited CPU; else percent of one core (100 = 1.0 --cpus) */
  cpuLimit: number;
};

const DEFAULT_LIMITS: ServerLimits = { diskMb: 10_240, cpuLimit: 0 };

const memoryLimits = new Map<string, ServerLimits>();

function limitsPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-limits.json");
}

export function getCachedLimits(serverId: string): ServerLimits {
  return memoryLimits.get(serverId) ?? DEFAULT_LIMITS;
}

export async function readServerLimits(serverId: string): Promise<ServerLimits> {
  const cached = memoryLimits.get(serverId);
  if (cached) return cached;
  try {
    const raw = await fs.readFile(limitsPath(serverId), "utf8");
    const parsed = JSON.parse(raw) as Partial<ServerLimits>;
    const limits: ServerLimits = {
      diskMb:
        typeof parsed.diskMb === "number" && parsed.diskMb >= 0
          ? Math.floor(parsed.diskMb)
          : DEFAULT_LIMITS.diskMb,
      cpuLimit:
        typeof parsed.cpuLimit === "number" && parsed.cpuLimit >= 0
          ? Math.floor(parsed.cpuLimit)
          : 0,
    };
    memoryLimits.set(serverId, limits);
    return limits;
  } catch {
    return DEFAULT_LIMITS;
  }
}

export async function writeServerLimits(serverId: string, limits: ServerLimits): Promise<void> {
  const next: ServerLimits = {
    diskMb: Math.max(0, Math.floor(limits.diskMb)),
    cpuLimit: Math.max(0, Math.floor(limits.cpuLimit)),
  };
  memoryLimits.set(serverId, next);
  const dir = serverDir(serverId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(limitsPath(serverId), JSON.stringify(next, null, 2), "utf8");
}

/** Bytes used under the server data directory (excludes backup archives). */
export async function serverDataBytes(serverId: string): Promise<number> {
  const usage = await getDiskUsageCached(serverId);
  // totalBytes includes backups; enforce against live data only
  return Math.max(0, usage.totalBytes - usage.backupsBytes);
}

export function diskLimitBytes(diskMb: number): number | null {
  if (!diskMb || diskMb <= 0) return null;
  return diskMb * 1024 * 1024;
}

/**
 * Throws if adding `additionalBytes` would exceed the server disk quota.
 * `additionalBytes` may be negative when replacing a smaller file.
 */
export async function assertDiskSpace(serverId: string, additionalBytes: number): Promise<void> {
  const limits = await readServerLimits(serverId);
  const limit = diskLimitBytes(limits.diskMb);
  if (limit == null) return;

  const used = peekDiskUsage(serverId)
    ? Math.max(0, peekDiskUsage(serverId)!.totalBytes - peekDiskUsage(serverId)!.backupsBytes)
    : await serverDataBytes(serverId);

  if (used + additionalBytes > limit) {
    const usedMb = (used / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Disk quota exceeded (${usedMb} / ${limits.diskMb} MB). Delete files or raise the disk limit.`,
    );
  }
}

/** True when current usage is at or over the limit. */
export async function isOverDiskQuota(serverId: string): Promise<boolean> {
  const limits = await readServerLimits(serverId);
  const limit = diskLimitBytes(limits.diskMb);
  if (limit == null) return false;
  const used = await serverDataBytes(serverId);
  return used >= limit;
}

export function cpuLimitToDockerCpus(cpuLimit: number): string | null {
  if (!cpuLimit || cpuLimit <= 0) return null;
  const cores = cpuLimit / 100;
  if (cores <= 0) return null;
  return (Math.round(cores * 100) / 100).toFixed(2);
}

export function invalidateServerDataCache(serverId: string): void {
  invalidateDiskUsage(serverId);
}
