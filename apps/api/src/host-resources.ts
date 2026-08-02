import os from "node:os";
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
