/**
 * Daemon-side license gate: verify panel-pushed tickets and enforce caps on start.
 */
import fs from "node:fs";
import path from "node:path";
import { verifyLicenseClaims, type LicenseSignedClaims } from "@msm/shared/license-signing";
import { freeTierCaps, type DaemonLicenseTicket, type EffectiveLicenseCaps } from "@msm/shared";
import { daemonConfig } from "./config.js";

type StoredTicket = {
  ticket: DaemonLicenseTicket;
  /** Wall-clock when we last accepted a fresh licensed signature (exp still valid). */
  lastFreshAtMs: number;
};

let stored: StoredTicket | null = null;

const GRACE_MS = Math.max(
  0,
  Number(process.env.LICENSE_UNREACHABLE_GRACE_MS ?? 12 * 60 * 60 * 1000),
);

function publicKeyPem(): string {
  const fromEnv = process.env.LICENSE_VERIFY_PUBLIC_KEY?.trim();
  if (fromEnv) {
    return fromEnv.includes("BEGIN") ? fromEnv : Buffer.from(fromEnv, "base64").toString("utf8");
  }
  const file =
    process.env.LICENSE_VERIFY_PUBLIC_KEY_FILE?.trim() ||
    path.join(daemonConfig.rootDir, "data", "licenses", "signing-public.pem");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function isFreshLicensed(claims: LicenseSignedClaims, nowSec: number): boolean {
  return Boolean(claims.valid) && claims.exp >= nowSec && claims.iat <= nowSec + 60;
}

export function acceptLicenseTicket(raw: unknown): {
  ok: boolean;
  error?: string;
  mode?: "licensed" | "free";
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "ticket required" };
  }
  const ticket = raw as DaemonLicenseTicket;
  if (ticket.v !== 1 || (ticket.kind !== "licensed" && ticket.kind !== "free")) {
    return { ok: false, error: "invalid ticket shape" };
  }

  if (ticket.kind === "free") {
    stored = {
      ticket: { ...ticket, kind: "free", pushedAt: Date.now() },
      lastFreshAtMs: stored?.lastFreshAtMs ?? 0,
    };
    return { ok: true, mode: "free" };
  }

  const claims = ticket.claims;
  const signature = ticket.signature;
  if (!claims || !signature) {
    return { ok: false, error: "licensed ticket missing claims/signature" };
  }
  const pub = publicKeyPem();
  if (!pub) {
    return {
      ok: false,
      error: "signing-public.pem (or LICENSE_VERIFY_PUBLIC_KEY) missing on daemon",
    };
  }
  if (!verifyLicenseClaims(pub, claims, signature)) {
    return { ok: false, error: "ticket signature invalid" };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const fresh = isFreshLicensed(claims, nowSec);
  // Accept expired-but-verifiable signatures only to refresh grace window if we
  // already had a fresh ticket; otherwise require fresh claims.
  if (!fresh && !(stored?.lastFreshAtMs && claims.valid)) {
    if (!claims.valid) {
      stored = {
        ticket: { v: 1, kind: "free", pushedAt: Date.now() },
        lastFreshAtMs: 0,
      };
      return { ok: true, mode: "free" };
    }
    return { ok: false, error: "licensed ticket signature expired" };
  }

  stored = {
    ticket: {
      v: 1,
      kind: "licensed",
      pushedAt: Date.now(),
      claims,
      signature,
    },
    lastFreshAtMs: fresh ? Date.now() : (stored?.lastFreshAtMs ?? Date.now()),
  };
  return { ok: true, mode: "licensed" };
}

export function getLicenseTicketStatus(): {
  hasTicket: boolean;
  mode: "licensed" | "free" | "none";
  lastFreshAtMs: number | null;
  graceMs: number;
} {
  if (!stored) {
    return { hasTicket: false, mode: "none", lastFreshAtMs: null, graceMs: GRACE_MS };
  }
  const caps = resolveEffectiveCaps();
  return {
    hasTicket: true,
    mode: caps.mode,
    lastFreshAtMs: stored.lastFreshAtMs || null,
    graceMs: GRACE_MS,
  };
}

export function resolveEffectiveCaps(): EffectiveLicenseCaps {
  const free = freeTierCaps();
  if (!stored || stored.ticket.kind === "free") {
    return {
      mode: "free",
      maxServers: free.maxServers,
      maxDiskMb: free.maxDiskMb,
      maxMemoryMb: free.maxMemoryMb,
      maxMemoryMbPerServer: free.maxMemoryMbPerServer,
    };
  }

  const claims = stored.ticket.claims;
  const signature = stored.ticket.signature;
  const pub = publicKeyPem();
  if (!claims || !signature || !pub || !verifyLicenseClaims(pub, claims, signature)) {
    return {
      mode: "free",
      maxServers: free.maxServers,
      maxDiskMb: free.maxDiskMb,
      maxMemoryMb: free.maxMemoryMb,
      maxMemoryMbPerServer: free.maxMemoryMbPerServer,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const fresh = isFreshLicensed(claims, nowSec);
  const withinGrace =
    !fresh &&
    claims.valid &&
    stored.lastFreshAtMs > 0 &&
    Date.now() - stored.lastFreshAtMs < GRACE_MS;

  if (!claims.valid || (!fresh && !withinGrace)) {
    return {
      mode: "free",
      maxServers: free.maxServers,
      maxDiskMb: free.maxDiskMb,
      maxMemoryMb: free.maxMemoryMb,
      maxMemoryMbPerServer: free.maxMemoryMbPerServer,
    };
  }

  return {
    mode: "licensed",
    maxServers: claims.maxServers,
    maxDiskMb: null,
    maxMemoryMb: claims.maxMemoryMb,
    maxMemoryMbPerServer: claims.maxMemoryMbPerServer,
  };
}

export class DaemonLicenseError extends Error {
  code = "LICENSE_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "DaemonLicenseError";
  }
}

/**
 * Enforce caps before container start/restart.
 * @param otherRunningIds server ids already running/starting on this node (excluding self)
 */
export function assertDaemonAllowsStart(opts: {
  serverId: string;
  memoryMb: number;
  diskMb: number;
  otherActiveServerIds: string[];
}): void {
  const caps = resolveEffectiveCaps();
  const others = opts.otherActiveServerIds.filter((id) => id !== opts.serverId);

  if (caps.maxServers != null && others.length >= caps.maxServers) {
    throw new DaemonLicenseError(
      caps.mode === "free"
        ? `Cannot start — free tier allows ${caps.maxServers} server(s) on this install (daemon gate). Activate a license on the panel.`
        : `Cannot start — license maxServers=${caps.maxServers} already reached on this node (daemon gate).`,
    );
  }

  if (caps.maxDiskMb != null) {
    if (opts.diskMb <= 0 || opts.diskMb > caps.maxDiskMb) {
      throw new DaemonLicenseError(
        `Cannot start — disk ${opts.diskMb <= 0 ? "unlimited" : `${opts.diskMb} MB`} exceeds free-tier max ${caps.maxDiskMb} MB (daemon gate).`,
      );
    }
  }

  if (caps.maxMemoryMbPerServer != null && opts.memoryMb > caps.maxMemoryMbPerServer) {
    throw new DaemonLicenseError(
      `Cannot start — ${opts.memoryMb} MB exceeds license max ${caps.maxMemoryMbPerServer} MB per server (daemon gate).`,
    );
  }

  if (caps.maxMemoryMb != null) {
    // otherActive memories unknown here without configs — best-effort: block if alone over total
    if (opts.memoryMb > caps.maxMemoryMb && others.length === 0) {
      throw new DaemonLicenseError(
        `Cannot start — ${opts.memoryMb} MB exceeds license total RAM pool ${caps.maxMemoryMb} MB (daemon gate).`,
      );
    }
  }
}
