import fs from "node:fs/promises";
import path from "node:path";
import { formatBytes } from "@msm/shared";
import { serverBackupsDir } from "../config.js";

export const TAR_EXCLUDES = [
  "--exclude=logs",
  "--exclude=crash-reports",
  "--exclude=*.log",
  "--exclude=cache",
  "--exclude=.cache",
  "--exclude=versions",
  "--exclude=libraries",
  "--exclude=.fabric",
  "--exclude=session.lock",
];

/** Backup ids are ISO-like timestamps (e.g. 2026-08-06T13-45-00-000Z) — never path segments. */
export function assertSafeBackupId(backupId: string): void {
  if (!backupId || !/^[A-Za-z0-9._-]{1,128}$/.test(backupId) || backupId.includes("..")) {
    throw new Error("Invalid backup id");
  }
}

export function formatBackupSize(bytes: number): string {
  return formatBytes(bytes);
}

export function metaPath(serverId: string, backupId: string): string {
  assertSafeBackupId(backupId);
  return path.join(serverBackupsDir(serverId), `${backupId}.json`);
}

export function archivePath(serverId: string, backupId: string): string {
  assertSafeBackupId(backupId);
  return path.join(serverBackupsDir(serverId), `${backupId}.tar.gz`);
}

export function encryptedPath(serverId: string, backupId: string): string {
  assertSafeBackupId(backupId);
  return path.join(serverBackupsDir(serverId), `${backupId}.tar.gz.enc`);
}

/** Resolve on-disk archive path (plain or encrypted). */
export async function resolveBackupArchivePath(
  serverId: string,
  backupId: string,
): Promise<{ path: string; encrypted: boolean }> {
  assertSafeBackupId(backupId);
  const root = path.resolve(serverBackupsDir(serverId));
  const enc = path.resolve(encryptedPath(serverId, backupId));
  const plain = path.resolve(archivePath(serverId, backupId));
  if (!enc.startsWith(root + path.sep) || !plain.startsWith(root + path.sep)) {
    throw new Error("Invalid backup id");
  }
  try {
    await fs.access(enc);
    return { path: enc, encrypted: true };
  } catch {
    // continue
  }
  try {
    await fs.access(plain);
    return { path: plain, encrypted: false };
  } catch {
    throw new Error("Backup not found");
  }
}
