import fs from "node:fs/promises";
import { normalizeLicenseFeatures } from "@msm/shared";
import type { LicenseSignedClaims } from "@msm/shared/license-signing";
import {
  hashLicenseKey,
  verifyLicenseClaims,
} from "@msm/shared/license-signing";
import type { DaemonLicenseTicket } from "@msm/shared/license-ticket";
import { config } from "../config.js";
import { logActivity } from "../activity-log.js";
import { hostPublicIp } from "../nodes/host-resources.js";
import { daemonPushLicenseTicketAll } from "../nodes/daemon-client.js";
import {
  getProductVersion,
  isUpdateAvailable,
  meetsMinVersion,
} from "../product-version.js";
import {
  enforceUnlicensedFreeTier,
  getPanelServerUsage,
  getUnlicensedFreeTier,
  stopServersExceedingLicenseQuota,
} from "./license-quota.js";
import {
  getInstallId,
  getLicenseCacheEntry,
  getLicenseKey,
  getLicenseServerUrl,
  lastLicenseOkAt,
  LICENSE_CACHE_MS,
  LICENSE_PUBLIC_KEY_FILE,
  markLicenseOk,
  maskLicenseKey,
  registerLicenseKeyClearedHandler,
  setCachedLicenseState,
} from "./license-store.js";
import type {
  LicensePanelStatus,
  LicenseState,
} from "./license-store.js";

export {
  clearLicenseKey,
  getCachedLicenseState,
  getInstallId,
  getLicenseKey,
  getLicenseServerUrl,
  getLicenseServerUrlInfo,
  parseLicenseServerUrl,
  setLicenseKey,
  setLicenseServerUrl,
  userFacingLicenseMessage,
} from "./license-store.js";
export type { LicensePanelStatus, LicenseState } from "./license-store.js";
export { getPanelVersionStatus } from "./license-version.js";
export {
  startLicenseWatcher,
  stopLicenseWatcher,
} from "./license-watcher.js";

/** After this many ms without a successful signed validate, treat as invalid (default 12h). */
const UNREACHABLE_GRACE_MS = Number(
  process.env.LICENSE_UNREACHABLE_GRACE_MS ?? 12 * 60 * 60 * 1000,
);
/** Alert after this many consecutive failed validates (network/signature). */
const VALIDATE_FAIL_ALERT_THRESHOLD = Math.max(
  1,
  Number(process.env.LICENSE_VALIDATE_FAIL_ALERTS ?? 3),
);

let lastSignedTicket: {
  claims: LicenseSignedClaims;
  signature: string;
} | null = null;
let consecutiveValidateFailures = 0;

let cachedPublicKeyPem: string | null | undefined;

async function loadVerifyPublicKey(): Promise<string | null> {
  if (cachedPublicKeyPem !== undefined) return cachedPublicKeyPem;
  const fromEnv = process.env.LICENSE_VERIFY_PUBLIC_KEY?.trim();
  if (fromEnv) {
    cachedPublicKeyPem = fromEnv.includes("BEGIN")
      ? fromEnv
      : `-----BEGIN PUBLIC KEY-----\n${fromEnv}\n-----END PUBLIC KEY-----\n`;
    return cachedPublicKeyPem;
  }
  try {
    cachedPublicKeyPem = await fs.readFile(LICENSE_PUBLIC_KEY_FILE(), "utf8");
    return cachedPublicKeyPem;
  } catch {
    cachedPublicKeyPem = null;
    return null;
  }
}

function allowUnsigned(): boolean {
  if (
    process.env.LICENSE_ALLOW_UNSIGNED !== "1" &&
    process.env.LICENSE_ALLOW_UNSIGNED !== "true"
  ) {
    return false;
  }
  // Never honor the escape hatch in production builds.
  if (
    process.env.NODE_ENV === "production" ||
    process.env.HTTPS_ENABLED === "true" ||
    process.env.HTTPS_ENABLED === "1"
  ) {
    console.error(
      "[license] LICENSE_ALLOW_UNSIGNED is set but ignored in production/HTTPS installs",
    );
    return false;
  }
  return true;
}
let lastValid: boolean | null = null;
let inFlight: Promise<LicenseState> | null = null;

async function pushDaemonLicenseTicket(state: LicenseState): Promise<void> {
  let ticket: DaemonLicenseTicket;
  if (
    state.valid &&
    lastSignedTicket &&
    lastSignedTicket.claims.valid
  ) {
    ticket = {
      v: 1,
      kind: "licensed",
      pushedAt: Date.now(),
      claims: lastSignedTicket.claims,
      signature: lastSignedTicket.signature,
    };
  } else if (
    state.status === "unreachable" &&
    state.valid &&
    lastSignedTicket?.claims.valid
  ) {
    // Soft-valid grace: keep last signed ticket on daemons.
    ticket = {
      v: 1,
      kind: "licensed",
      pushedAt: Date.now(),
      claims: lastSignedTicket.claims,
      signature: lastSignedTicket.signature,
    };
  } else {
    ticket = { v: 1, kind: "free", pushedAt: Date.now() };
  }
  try {
    const { pushed, failed } = await daemonPushLicenseTicketAll(ticket);
    if (failed > 0) {
      console.warn(
        `[license] daemon ticket push: ${pushed} ok, ${failed} failed (kind=${ticket.kind})`,
      );
    }
  } catch (err) {
    console.warn(
      "[license] daemon ticket push error:",
      err instanceof Error ? err.message : err,
    );
  }
}

registerLicenseKeyClearedHandler(async (state) => {
  lastSignedTicket = null;
  await pushDaemonLicenseTicket(state);
});

function noteValidateFailure(message: string): void {
  consecutiveValidateFailures += 1;
  if (consecutiveValidateFailures === VALIDATE_FAIL_ALERT_THRESHOLD) {
    logActivity({
      action: "license.validate-failed",
      actor: "system",
      user: null,
      serverId: null,
      success: false,
      metadata: {
        consecutive: consecutiveValidateFailures,
        message: message.slice(0, 500),
      },
    });
  }
}

function noteValidateSuccess(): void {
  consecutiveValidateFailures = 0;
}

export async function validateLicense(force = false): Promise<LicenseState> {
  const now = Date.now();
  const cache = getLicenseCacheEntry();
  if (
    !force &&
    cache.state &&
    now - cache.cachedAt < LICENSE_CACHE_MS
  ) {
    return cache.state;
  }
  if (inFlight) return inFlight;

  inFlight = doValidateLicense().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doValidateLicense(): Promise<LicenseState> {
  const now = Date.now();
  const key = await getLicenseKey();
  const checkedAt = new Date().toISOString();
  let cached = getLicenseCacheEntry().state;

  if (!key) {
    cached = {
      valid: false,
      status: "missing",
      message: "No LICENSE_KEY configured",
      expiresAt: null,
      label: null,
      checkedAt,
      keyMasked: "",
    };
    setCachedLicenseState(cached, now);
    await maybeEnforceTransition(false, cached.message);
    await pushDaemonLicenseTicket(cached);
    return cached;
  }

  try {
    const installId = await getInstallId();
    const base = await getLicenseServerUrl();
    const usage = await getPanelServerUsage().catch(() => null);
    const res = await fetch(`${base}/v1/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        key,
        installId,
        publicHost: config.publicHost,
        publicIp: hostPublicIp() || process.env.PUBLIC_IP?.trim() || null,
        panelVersion: getProductVersion(),
        usage: usage
          ? {
              serverCount: usage.serverCount,
              memoryUsedMb: usage.memoryUsedMb,
              nodeCount: usage.nodeCount,
              maxServerMemoryMb: usage.maxServerMemoryMb,
            }
          : undefined,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const rawBody = await res.text();
    const trimmed = rawBody.trim();
    const looksLikeHtml =
      trimmed.startsWith("<!") ||
      trimmed.toLowerCase().startsWith("<html") ||
      /just a moment/i.test(trimmed) ||
      /cf-browser-verification|challenge-platform|cloudflare/i.test(trimmed);
    let data = {} as {
      valid?: boolean;
      status?: string;
      message?: string;
      expiresAt?: string | null;
      label?: string | null;
      error?: string;
      latestVersion?: string;
      minVersion?: string;
      notes?: string;
      updateAvailable?: boolean;
      belowMinimum?: boolean;
      maxServers?: number | null;
      maxNodes?: number | null;
      maxMemoryMb?: number | null;
      maxMemoryMbPerServer?: number | null;
      features?: string[] | null;
      boundIp?: string | null;
      boundIps?: string[];
      claims?: LicenseSignedClaims;
      signature?: string;
    };
    if (!looksLikeHtml && trimmed) {
      try {
        data = JSON.parse(trimmed) as typeof data;
      } catch {
        data = {};
      }
    }

    const pub = await loadVerifyPublicKey();
    let signatureOk = false;
    if (data.claims && data.signature && pub) {
      const nowSec = Math.floor(Date.now() / 1000);
      const claims = data.claims;
      const hashOk = claims.keyHash === hashLicenseKey(key);
      const fresh = claims.iat <= nowSec + 60 && claims.exp >= nowSec;
      const sigOk = verifyLicenseClaims(pub, claims, data.signature);
      signatureOk = hashOk && fresh && sigOk;
      if (signatureOk) {
        // Prefer signed claims over unsigned JSON fields
        data.valid = claims.valid;
        data.status = claims.status;
        data.expiresAt = claims.expiresAt;
        data.maxServers = claims.maxServers;
        data.maxNodes = claims.maxNodes;
        data.maxMemoryMb = claims.maxMemoryMb;
        data.maxMemoryMbPerServer = claims.maxMemoryMbPerServer;
        data.features = normalizeLicenseFeatures(
          claims.features === undefined ? null : claims.features,
        );
        data.boundIp = claims.boundIp;
        data.boundIps = claims.boundIps ?? [];
        lastSignedTicket = {
          claims,
          signature: data.signature,
        };
      }
    }

    if (!signatureOk) {
      if (!allowUnsigned()) {
        let message: string;
        if (!pub) {
          message =
            "LICENSE_VERIFY_PUBLIC_KEY (or data/licenses/signing-public.pem) is required";
        } else if (looksLikeHtml || res.status === 403) {
          message =
            `License server at ${base} returned HTTP ${res.status} HTML (often a Cloudflare bot challenge) instead of a signed JSON validate response — ensure the license hostname is DNS-only with a public TLS cert, or disable Bot Fight / WAF challenge for that host`;
        } else if (!data.claims || !data.signature) {
          message =
            `License response from ${base} is missing claims/signature (HTTP ${res.status}) — refusing to trust unsigned status`;
        } else {
          message =
            "License response signature invalid or missing — refusing to trust unsigned status";
        }
        cached = {
          valid: false,
          status: "unknown",
          message,
          expiresAt: null,
          label: null,
          checkedAt,
          keyMasked: maskLicenseKey(key),
        };
        setCachedLicenseState(cached, now);
        await maybeEnforceTransition(false, cached.message);
        noteValidateFailure(cached.message);
        await pushDaemonLicenseTicket(cached);
        return cached;
      }
      console.warn(
        "[license] WARNING: accepting unsigned validate response (LICENSE_ALLOW_UNSIGNED=1)",
      );
    }

    const status = (data.status ||
      (res.ok && data.valid ? "valid" : "unknown")) as LicensePanelStatus;
    const valid = Boolean(data.valid) && status === "valid" && (signatureOk || allowUnsigned());
    const current = getProductVersion();
    const latest = data.latestVersion?.trim() || null;
    const minVersion = data.minVersion?.trim() || null;
    cached = {
      valid,
      status: valid ? "valid" : status,
      message: data.message || data.error || (valid ? "License is valid" : "License invalid"),
      expiresAt: data.expiresAt ?? null,
      label: data.label ?? null,
      checkedAt,
      keyMasked: maskLicenseKey(key),
      latestVersion: latest,
      minVersion,
      updateAvailable:
        typeof data.updateAvailable === "boolean"
          ? data.updateAvailable
          : latest
            ? isUpdateAvailable(current, latest)
            : false,
      belowMinimum:
        typeof data.belowMinimum === "boolean"
          ? data.belowMinimum
          : minVersion
            ? !meetsMinVersion(current, minVersion)
            : false,
      versionNotes: data.notes?.trim() || null,
      maxServers:
        data.maxServers === undefined ? null : data.maxServers,
      maxNodes: data.maxNodes === undefined ? null : data.maxNodes,
      maxMemoryMb:
        data.maxMemoryMb === undefined ? null : data.maxMemoryMb,
      maxMemoryMbPerServer:
        data.maxMemoryMbPerServer === undefined
          ? null
          : data.maxMemoryMbPerServer,
      features: normalizeLicenseFeatures(
        data.features === undefined ? null : data.features,
      ),
      boundIp: data.boundIp ?? null,
      boundIps: Array.isArray(data.boundIps)
        ? data.boundIps
        : data.boundIp
          ? [data.boundIp]
          : [],
    };
    setCachedLicenseState(cached, now);
    if (valid) await markLicenseOk();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lastOk = await lastLicenseOkAt();
    const withinGrace =
      lastOk != null && Date.now() - lastOk < UNREACHABLE_GRACE_MS;
    // Soft-valid only inside grace after a previously successful signed check.
    const softValid =
      withinGrace && lastValid === true && cached?.valid === true;
    cached = {
      valid: softValid,
      status: "unreachable",
      message: softValid
        ? `License server unreachable (grace remaining): ${message}`
        : `License server unreachable — grace expired or never validated: ${message}`,
      expiresAt: cached?.expiresAt ?? null,
      label: cached?.label ?? null,
      checkedAt,
      keyMasked: maskLicenseKey(key),
      maxServers: cached?.maxServers,
      maxNodes: cached?.maxNodes,
      maxMemoryMb: cached?.maxMemoryMb,
      maxMemoryMbPerServer: cached?.maxMemoryMbPerServer,
      features: cached?.features,
      boundIp: cached?.boundIp,
      boundIps: cached?.boundIps,
    };
    setCachedLicenseState(cached, now);
    await maybeEnforceTransition(cached.valid, cached.message);
    noteValidateFailure(cached.message);
    await pushDaemonLicenseTicket(cached);
    return cached;
  }

  await maybeEnforceTransition(cached.valid, cached.message);
  if (cached.valid) {
    noteValidateSuccess();
    await stopServersExceedingLicenseQuota(cached).catch((err) => {
      console.warn(
        "[license] quota enforcement failed:",
        err instanceof Error ? err.message : err,
      );
    });
  } else {
    noteValidateSuccess(); // contacted license server; invalid key is not a transport failure
    await enforceUnlicensedFreeTier(cached.message).catch((err) => {
      console.warn(
        "[license] free-tier enforcement failed:",
        err instanceof Error ? err.message : err,
      );
    });
  }
  await pushDaemonLicenseTicket(cached);
  return cached;
}

async function maybeEnforceTransition(
  valid: boolean,
  message: string,
): Promise<void> {
  const was = lastValid;
  lastValid = valid;
  if (was === true && valid === false) {
    const stopped = await enforceUnlicensedFreeTier(message);
    logActivity({
      action: "license.expired",
      actor: "system",
      user: null,
      serverId: null,
      success: true,
      metadata: {
        message,
        stopped,
        freeTier: getUnlicensedFreeTier(),
      },
    });
  }
}
