import type { LicenseSignedClaims } from "./license-signing.js";

/** Free-tier caps when license is missing/invalid (panel + daemon). */
export const UNLICENSED_MAX_NODES = 1;
export const UNLICENSED_MAX_SERVERS = 1;
export const UNLICENSED_MAX_DISK_MB = 10_240;
export const UNLICENSED_MAX_MEMORY_MB = 8192;

/**
 * Ticket the panel pushes to each daemon after license validate.
 * Licensed tickets carry Ed25519 claims+signature from the license server.
 * Free tickets are panel-authenticated only (daemon JWT) and cap at free tier.
 */
export type DaemonLicenseTicket = {
  v: 1;
  kind: "licensed" | "free";
  pushedAt: number;
  /** Present when kind=licensed — verified with signing-public.pem */
  claims?: LicenseSignedClaims;
  signature?: string;
};

export function freeTierCaps(): {
  maxServers: number;
  maxDiskMb: number;
  maxMemoryMb: number;
  maxMemoryMbPerServer: number | null;
} {
  return {
    maxServers: UNLICENSED_MAX_SERVERS,
    maxDiskMb: UNLICENSED_MAX_DISK_MB,
    maxMemoryMb: UNLICENSED_MAX_MEMORY_MB,
    maxMemoryMbPerServer: null,
  };
}

export type EffectiveLicenseCaps = {
  mode: "licensed" | "free";
  maxServers: number | null;
  maxDiskMb: number | null;
  maxMemoryMb: number | null;
  maxMemoryMbPerServer: number | null;
};
