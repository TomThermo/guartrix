/**
 * Cross-replica backup/restore busy lock.
 * Without Redis: process-local Set (single-API).
 * With Redis: SET NX + TTL so concurrent API replicas don't overlap on one server.
 */
import { getRedis } from "../redis.js";

const localBusy = new Set<string>();

function busyKey(serverId: string): string {
  return `guartrix:backup-busy:${serverId}`;
}

function busyTtlMs(): number {
  const raw = Number(process.env.BACKUP_BUSY_TTL_MS ?? 2 * 60 * 60 * 1000);
  if (!Number.isFinite(raw)) return 2 * 60 * 60 * 1000;
  return Math.min(Math.max(Math.trunc(raw), 60_000), 24 * 60 * 60 * 1000);
}

export async function isBackupBusy(serverId: string): Promise<boolean> {
  if (localBusy.has(serverId)) return true;
  const redis = await getRedis();
  if (!redis) return false;
  try {
    const v = await redis.get(busyKey(serverId));
    return Boolean(v);
  } catch {
    // Blip: treat as not busy for UI; acquire still protects writes.
    return false;
  }
}

/** Acquire exclusive backup/restore lock. Returns false if already busy. */
export async function tryAcquireBackupBusy(serverId: string): Promise<boolean> {
  if (localBusy.has(serverId)) return false;

  const redis = await getRedis();
  if (redis) {
    try {
      const result = await redis.set(
        busyKey(serverId),
        "1",
        "PX",
        busyTtlMs(),
        "NX",
      );
      if (result !== "OK") return false;
    } catch {
      // Redis configured but failing — refuse acquire to avoid split-brain restores.
      return false;
    }
  }

  localBusy.add(serverId);
  return true;
}

export async function releaseBackupBusy(serverId: string): Promise<void> {
  localBusy.delete(serverId);
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(busyKey(serverId));
  } catch {
    // ignore — TTL will clear
  }
}

/** Test helper — clear process-local locks only. */
export function resetBackupBusyLocalForTests(): void {
  localBusy.clear();
}
