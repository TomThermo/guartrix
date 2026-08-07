import os from "node:os";
import fsp from "node:fs/promises";
import { config } from "./config.js";

/** Total host RAM in whole GB (minimum 1). */
export function hostTotalMemoryGb(): number {
  return Math.max(1, Math.floor(os.totalmem() / (1024 * 1024 * 1024)));
}

/** Total host RAM as GB × 1024 MB (matches UI 1 GB steps). */
export function hostTotalMemoryMb(): number {
  return hostTotalMemoryGb() * 1024;
}

export function hostNodeName(): string {
  return os.hostname() || "local";
}

/** Prefer PUBLIC_IP, then PUBLIC_HOST when IPv4, else first non-internal IPv4. */
export function hostPublicIp(): string | null {
  const fromEnv = process.env.PUBLIC_IP?.trim();
  if (fromEnv && /^\d{1,3}(\.\d{1,3}){3}$/.test(fromEnv)) {
    return fromEnv;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)) {
    return config.publicHost;
  }
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return null;
}

/** Every non-internal IPv4 address on this host, per network interface. */
export function hostLocalIps(): Array<{ iface: string; address: string }> {
  const nets = os.networkInterfaces();
  const out: Array<{ iface: string; address: string }> = [];
  for (const [iface, entries] of Object.entries(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        out.push({ iface, address: entry.address });
      }
    }
  }
  return out;
}

export function hostCpuCount(): number {
  return Math.max(os.cpus().length, 1);
}

/** 1/5/15 minute load averages (0s on platforms without support, e.g. Windows). */
export function hostLoadAvg(): [number, number, number] {
  const [a = 0, b = 0, c = 0] = os.loadavg();
  return [a, b, c];
}

export interface HostDiskUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

/** Disk usage of the filesystem holding `dirPath` (defaults to the data dir). */
export async function hostDiskUsage(dirPath?: string): Promise<HostDiskUsage> {
  const target = dirPath ?? config.dataDir;
  const stat = await fsp.statfs(target);
  const totalBytes = stat.blocks * stat.bsize;
  const freeBytes = stat.bavail * stat.bsize;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
  return { totalBytes, usedBytes, freeBytes, usedPercent };
}

export interface HostNetworkTotals {
  rxBytes: number;
  txBytes: number;
}

/**
 * Cumulative host NIC counters (all non-loopback interfaces) from /proc/net/dev.
 * Returns zeros when unavailable (e.g. non-Linux).
 */
export async function hostNetworkTotals(): Promise<HostNetworkTotals> {
  try {
    const raw = await fsp.readFile("/proc/net/dev", "utf8");
    let rxBytes = 0;
    let txBytes = 0;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Inter") || trimmed.startsWith("face")) {
        continue;
      }
      const colon = trimmed.indexOf(":");
      if (colon < 0) continue;
      const iface = trimmed.slice(0, colon).trim();
      if (!iface || iface === "lo") continue;
      const cols = trimmed
        .slice(colon + 1)
        .trim()
        .split(/\s+/);
      const rx = Number(cols[0]);
      const tx = Number(cols[8]);
      if (Number.isFinite(rx)) rxBytes += rx;
      if (Number.isFinite(tx)) txBytes += tx;
    }
    return { rxBytes, txBytes };
  } catch {
    return { rxBytes: 0, txBytes: 0 };
  }
}
