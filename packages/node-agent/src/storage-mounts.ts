import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import { hostDiskUsage, type HostDiskUsage } from "./host-resources.js";
import { serverIdsUnderMount } from "./server-locations.js";
import { isContainerRunning } from "./docker.js";

const execFileAsync = promisify(execFile);

export type StorageMountType = "local" | "nfs";

export interface StoragePathStatus {
  path: string;
  exists: boolean;
  mounted: boolean;
  source: string | null;
  fstype: string | null;
  disk: HostDiskUsage | null;
  busyServerIds: string[];
}

function allowPrefixes(): string[] {
  const raw =
    process.env.STORAGE_MOUNTS_ALLOW_PREFIX?.trim() ||
    `${path.join(config.dataDir, "mounts")},/var/lib/guartrix/mounts,${config.dataDir}`;
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
}

/** Reject relative / traversal paths; require allowlisted absolute prefix. */
export function assertAllowedMountPoint(mountPoint: string): string {
  const resolved = path.resolve(mountPoint.trim());
  if (!path.isAbsolute(resolved) || resolved !== path.normalize(resolved)) {
    throw new Error("Mount point must be an absolute normalized path");
  }
  if (resolved === "/" || resolved === "") {
    throw new Error("Refusing to use filesystem root as mount point");
  }
  const allowed = allowPrefixes();
  const ok = allowed.some(
    (prefix) => resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`),
  );
  if (!ok) {
    throw new Error(
      `Mount point must be under one of: ${allowed.join(", ")} (set STORAGE_MOUNTS_ALLOW_PREFIX)`,
    );
  }
  return resolved;
}

function assertSafeNfsServer(server: string): string {
  const s = server.trim();
  if (!/^[a-zA-Z0-9._:-]+$/.test(s) || s.length > 253) {
    throw new Error("Invalid NFS server hostname");
  }
  return s;
}

function assertSafeNfsExport(exportPath: string): string {
  const e = exportPath.trim();
  if (!e.startsWith("/") || e.includes("..") || /[\s;|&$`]/.test(e) || e.length > 512) {
    throw new Error("Invalid NFS export path");
  }
  return e;
}

function assertSafeMountOptions(opts: string | undefined): string {
  const o = (opts ?? "vers=4.1,hard,timeo=600,_netdev").trim();
  if (!o || o.length > 256 || /[;|&$`\n]/.test(o)) {
    throw new Error("Invalid NFS mount options");
  }
  return o;
}

async function isMountPoint(target: string): Promise<{ source: string; fstype: string } | null> {
  try {
    // --mountpoint: only if TARGET itself is a mount (not a parent filesystem)
    const { stdout } = await execFileAsync(
      "findmnt",
      ["-n", "-o", "SOURCE,FSTYPE", "--mountpoint", target],
      { timeout: 5_000 },
    );
    const line = stdout.trim();
    if (!line) return null;
    const parts = line.split(/\s+/);
    const source = parts[0] ?? "";
    const fstype = parts[1] ?? "";
    if (!source) return null;
    return { source, fstype };
  } catch {
    return null;
  }
}

async function busyServersOnMount(mountPoint: string): Promise<string[]> {
  const ids = serverIdsUnderMount(mountPoint);
  const busy: string[] = [];
  for (const id of ids) {
    try {
      if (await isContainerRunning(id)) busy.push(id);
    } catch {
      /* ignore */
    }
  }
  return busy;
}

export async function getStoragePathStatus(mountPoint: string): Promise<StoragePathStatus> {
  const resolved = path.resolve(mountPoint);
  let exists = false;
  try {
    const st = await fsp.stat(resolved);
    exists = st.isDirectory();
  } catch {
    exists = false;
  }
  const mnt = exists ? await isMountPoint(resolved) : null;
  let disk: HostDiskUsage | null = null;
  if (exists) {
    try {
      disk = await hostDiskUsage(resolved);
    } catch {
      disk = null;
    }
  }
  return {
    path: resolved,
    exists,
    mounted: Boolean(mnt),
    source: mnt?.source ?? null,
    fstype: mnt?.fstype ?? null,
    disk,
    busyServerIds: await busyServersOnMount(resolved),
  };
}

export async function getStorageStatuses(paths: string[]): Promise<StoragePathStatus[]> {
  const out: StoragePathStatus[] = [];
  for (const p of paths) {
    out.push(await getStoragePathStatus(p));
  }
  return out;
}

export interface MountStorageInput {
  type: StorageMountType;
  mountPoint: string;
  hostPath?: string | null;
  nfsServer?: string | null;
  nfsExport?: string | null;
  nfsOptions?: string | null;
}

async function sudoMount(args: string[]): Promise<void> {
  try {
    await execFileAsync("sudo", ["-n", "mount", ...args], { timeout: 60_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: Buffer | string }).stderr ?? "")
        : "";
    throw new Error(`mount failed: ${stderr.trim() || msg}`);
  }
}

async function sudoUmount(mountPoint: string, lazy: boolean): Promise<void> {
  const args = lazy ? ["-l", mountPoint] : [mountPoint];
  try {
    await execFileAsync("sudo", ["-n", "umount", ...args], { timeout: 30_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stderr =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr?: Buffer | string }).stderr ?? "")
        : "";
    throw new Error(`umount failed: ${stderr.trim() || msg}`);
  }
}

/** Mount local (bind) or NFS storage at mountPoint. */
export async function mountStorage(input: MountStorageInput): Promise<StoragePathStatus> {
  const mountPoint = assertAllowedMountPoint(input.mountPoint);
  await fsp.mkdir(mountPoint, { recursive: true });
  await fsp.mkdir(path.join(mountPoint, "servers"), { recursive: true });
  await fsp.mkdir(path.join(mountPoint, "backups"), { recursive: true });

  const current = await isMountPoint(mountPoint);
  if (current) {
    return getStoragePathStatus(mountPoint);
  }

  if (input.type === "nfs") {
    const server = assertSafeNfsServer(input.nfsServer ?? "");
    const exportPath = assertSafeNfsExport(input.nfsExport ?? "");
    const opts = assertSafeMountOptions(input.nfsOptions ?? undefined);
    await sudoMount(["-t", "nfs", "-o", opts, `${server}:${exportPath}`, mountPoint]);
  } else {
    const hostPath = path.resolve((input.hostPath ?? mountPoint).trim());
    if (!path.isAbsolute(hostPath)) {
      throw new Error("Local host path must be absolute");
    }
    await fsp.mkdir(hostPath, { recursive: true });
    if (hostPath !== mountPoint) {
      await sudoMount(["--bind", hostPath, mountPoint]);
    }
    // hostPath === mountPoint: directory is the storage root (already on a disk)
  }

  return getStoragePathStatus(mountPoint);
}

export interface UnmountStorageInput {
  mountPoint: string;
  lazy?: boolean;
  /** When true, allow unmount even if servers are mapped (containers must still be stopped). */
  force?: boolean;
}

/** Unmount storage; refuses when game containers on this mount are running. */
export async function unmountStorage(input: UnmountStorageInput): Promise<StoragePathStatus> {
  const mountPoint = assertAllowedMountPoint(input.mountPoint);
  const busy = await busyServersOnMount(mountPoint);
  if (busy.length && !input.force) {
    throw new Error(`Cannot unmount: servers still running: ${busy.join(", ")}`);
  }
  const mapped = serverIdsUnderMount(mountPoint);
  if (mapped.length && !input.force) {
    throw new Error(
      `Cannot unmount: ${mapped.length} server(s) still assigned to this storage (reassign or use force)`,
    );
  }

  const current = await isMountPoint(mountPoint);
  if (current) {
    await sudoUmount(mountPoint, Boolean(input.lazy));
  }

  return getStoragePathStatus(mountPoint);
}
