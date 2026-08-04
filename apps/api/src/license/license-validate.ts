import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { PanelVersionStatus } from "@msm/shared";
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

export type LicensePanelStatus =
  | "valid"
  | "expired"
  | "revoked"
  | "unknown"
  | "unreachable"
  | "missing"
  | "in_use";

export interface LicenseState {
  valid: boolean;
  status: LicensePanelStatus;
  message: string;
  expiresAt: string | null;
  label: string | null;
  checkedAt: string;
  keyMasked: string;
  /** Channel info from last successful license-server contact */
  latestVersion?: string | null;
  minVersion?: string | null;
  updateAvailable?: boolean;
  belowMinimum?: boolean;
  versionNotes?: string | null;
  /** Panel-wide caps from the license (null = unlimited) */
  maxServers?: number | null;
  maxNodes?: number | null;
  maxMemoryMb?: number | null;
  maxMemoryMbPerServer?: number | null;
  /**
   * Enabled permission-group ids (null = all features).
   * Empty array = none enabled.
   */
  features?: string[] | null;
  boundIp?: string | null;
  boundIps?: string[];
}

/** How often the panel contacts the license server (default 10 minutes). */
const CACHE_MS = Math.max(
  60_000,
  Number(process.env.LICENSE_VALIDATE_INTERVAL_MS ?? 10 * 60 * 1000),
);
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
const KEY_FILE = () => path.join(config.dataDir, "license-key");
const INSTALL_ID_FILE = () => path.join(config.dataDir, "license-install-id");
const SERVER_URL_FILE = () => path.join(config.dataDir, "license-server-url");
const LAST_OK_FILE = () => path.join(config.dataDir, "license-last-ok");
const PUBLIC_KEY_FILE = () =>
  path.join(config.dataDir, "licenses", "signing-public.pem");

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
    cachedPublicKeyPem = await fs.readFile(PUBLIC_KEY_FILE(), "utf8");
    return cachedPublicKeyPem;
  } catch {
    cachedPublicKeyPem = null;
    return null;
  }
}

async function markLicenseOk(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(LAST_OK_FILE(), String(Date.now()) + "\n", { mode: 0o600 });
}

async function lastLicenseOkAt(): Promise<number | null> {
  try {
    const raw = (await fs.readFile(LAST_OK_FILE(), "utf8")).trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
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
let cached: LicenseState | null = null;
let cachedAt = 0;
let lastValid: boolean | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<LicenseState> | null = null;
/** In-memory override after admin saves (avoids re-reading disk every call). */
let serverUrlOverride: string | null | undefined = undefined;

function normalizeLicenseServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function defaultLicenseServerUrl(): string {
  const fromEnv = process.env.LICENSE_SERVER_URL?.trim();
  if (fromEnv) return normalizeLicenseServerUrl(fromEnv);
  const publicLicense =
    process.env.LICENSE_PUBLIC_HOST?.trim() ||
    (process.env.PUBLIC_HOST?.trim() &&
    process.env.PUBLIC_HOST.trim() !== "localhost"
      ? `license.${process.env.PUBLIC_HOST.trim().replace(/^www\./i, "")}`
      : "license.guartrix.com");
  const host = publicLicense
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return normalizeLicenseServerUrl(`https://${host}`);
}

/** Validate http(s) URL for a remote or local license server. */
export function parseLicenseServerUrl(raw: string): string {
  let trimmed = raw.trim();
  if (!trimmed) throw new Error("License server URL is required");
  // Accept bare hostnames: license.example.com → https://license.example.com
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const hostOnly = trimmed.replace(/\/+$/, "");
    const isLocal =
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(hostOnly) ||
      /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(hostOnly);
    trimmed = `${isLocal ? "http" : "https"}://${hostOnly}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid license server URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("License server URL must start with http:// or https://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("License server URL must not include credentials");
  }
  const pathPart = parsed.pathname.replace(/\/+$/, "");
  const basePath = !pathPart || pathPart === "/" ? "" : pathPart;
  return `${parsed.protocol}//${parsed.host}${basePath}`;
}

export async function getLicenseServerUrl(): Promise<string> {
  if (serverUrlOverride !== undefined) {
    return serverUrlOverride || defaultLicenseServerUrl();
  }
  try {
    const fromFile = (await fs.readFile(SERVER_URL_FILE(), "utf8")).trim();
    if (fromFile) {
      serverUrlOverride = parseLicenseServerUrl(fromFile);
      return serverUrlOverride;
    }
  } catch {
    /* none */
  }
  serverUrlOverride = null;
  return defaultLicenseServerUrl();
}

export async function getLicenseServerUrlInfo(): Promise<{
  url: string;
  source: "file" | "env" | "default";
  envDefault: string;
}> {
  const envDefault = defaultLicenseServerUrl();
  try {
    const fromFile = (await fs.readFile(SERVER_URL_FILE(), "utf8")).trim();
    if (fromFile) {
      const url = parseLicenseServerUrl(fromFile);
      return { url, source: "file", envDefault };
    }
  } catch {
    /* none */
  }
  const fromEnv = process.env.LICENSE_SERVER_URL?.trim();
  return {
    url: envDefault,
    source: fromEnv ? "env" : "default",
    envDefault,
  };
}

export async function setLicenseServerUrl(url: string | null): Promise<string> {
  await fs.mkdir(config.dataDir, { recursive: true });
  if (!url || !url.trim()) {
    await fs.rm(SERVER_URL_FILE(), { force: true });
    serverUrlOverride = null;
    cached = null;
    cachedAt = 0;
    return defaultLicenseServerUrl();
  }
  const normalized = parseLicenseServerUrl(url);
  await fs.writeFile(SERVER_URL_FILE(), normalized + "\n", { mode: 0o600 });
  serverUrlOverride = normalized;
  cached = null;
  cachedAt = 0;
  return normalized;
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length < 10) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export async function getLicenseKey(): Promise<string> {
  // The key file is authoritative once it exists: an empty file means the
  // admin removed the license via the UI, so LICENSE_KEY in .env is ignored.
  try {
    return (await fs.readFile(KEY_FILE(), "utf8")).trim();
  } catch {
    /* no file — fall back to env */
  }
  return process.env.LICENSE_KEY?.trim() || "";
}

export async function setLicenseKey(key: string): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(KEY_FILE(), key.trim() + "\n", { mode: 0o600 });
  cached = null;
  cachedAt = 0;
}

/** Remove the license key — panel drops to the unlicensed free tier. */
export async function clearLicenseKey(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  // Empty file (not deletion) so a LICENSE_KEY left in .env does not resurface.
  await fs.writeFile(KEY_FILE(), "", { mode: 0o600 });
  await fs.rm(LAST_OK_FILE(), { force: true });
  cached = null;
  cachedAt = 0;
  lastSignedTicket = null;
  await pushDaemonLicenseTicket({
    valid: false,
    status: "missing",
    message: "License key cleared",
    expiresAt: null,
    label: null,
    checkedAt: new Date().toISOString(),
    keyMasked: "",
  });
}

export async function getInstallId(): Promise<string> {
  const fromEnv = process.env.LICENSE_INSTALL_ID?.trim();
  if (fromEnv) return fromEnv;
  try {
    const existing = (await fs.readFile(INSTALL_ID_FILE(), "utf8")).trim();
    if (existing) return existing;
  } catch {
    /* create */
  }
  const id = nanoid(16);
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(INSTALL_ID_FILE(), id + "\n", { mode: 0o600 });
  return id;
}

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

export function getCachedLicenseState(): LicenseState | null {
  return cached;
}

/** Safe message for any logged-in user (no key / internal details). */
export function userFacingLicenseMessage(state: LicenseState | null): string {
  if (!state) return "License status is unknown. Please try again shortly.";
  if (state.valid && state.status === "unreachable") {
    return "License server is temporarily unreachable; the panel is in a short grace period.";
  }
  if (state.valid) return "License is valid.";
  if (state.status === "unreachable") {
    return "License could not be verified and grace has expired. Free tier applies: 1 node, 1 server, 10 GB disk.";
  }
  return "No valid license. Free tier applies: 1 node, 1 Minecraft server, 10 GB disk.";
}

export async function validateLicense(force = false): Promise<LicenseState> {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_MS) {
    return cached;
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
    cachedAt = now;
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
          keyMasked: maskKey(key),
        };
        cachedAt = now;
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
      keyMasked: maskKey(key),
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
      keyMasked: maskKey(key),
      maxServers: cached?.maxServers,
      maxNodes: cached?.maxNodes,
      maxMemoryMb: cached?.maxMemoryMb,
      maxMemoryMbPerServer: cached?.maxMemoryMbPerServer,
      features: cached?.features,
      boundIp: cached?.boundIp,
      boundIps: cached?.boundIps,
    };
    cachedAt = now;
    await maybeEnforceTransition(cached.valid, cached.message);
    noteValidateFailure(cached.message);
    await pushDaemonLicenseTicket(cached);
    return cached;
  }

  cachedAt = now;
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

export function startLicenseWatcher(): void {
  void validateLicense(true).catch((err) => {
    console.warn(
      "[license] initial validate failed:",
      err instanceof Error ? err.message : err,
    );
  });
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    void validateLicense(true).catch(() => undefined);
  }, CACHE_MS);
  console.info(
    `[license] validate interval ${Math.round(CACHE_MS / 1000)}s (LICENSE_VALIDATE_INTERVAL_MS)`,
  );
}

export function stopLicenseWatcher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/** Admin-facing version / update status (uses license cache + optional /v1/latest). */
export async function getPanelVersionStatus(
  force = false,
): Promise<PanelVersionStatus> {
  const current = getProductVersion();
  const checkedAt = new Date().toISOString();
  try {
    const state = await validateLicense(force);
    if (
      state.status !== "unreachable" &&
      (state.latestVersion || state.minVersion)
    ) {
      const latest = state.latestVersion ?? current;
      return {
        current,
        latest: state.latestVersion ?? null,
        minVersion: state.minVersion ?? null,
        upToDate: !state.updateAvailable,
        updateAvailable: Boolean(state.updateAvailable),
        belowMinimum: Boolean(state.belowMinimum),
        notes: state.versionNotes ?? null,
        checkedAt,
        source: "license-server",
      };
    }
    // No key / unknown — still try public channel endpoint
    const base = await getLicenseServerUrl();
    const res = await fetch(`${base}/v1/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      latestVersion?: string;
      minVersion?: string;
      notes?: string;
    };
    const latest = data.latestVersion?.trim() || null;
    const minVersion = data.minVersion?.trim() || null;
    return {
      current,
      latest,
      minVersion,
      upToDate: latest ? !isUpdateAvailable(current, latest) : true,
      updateAvailable: latest ? isUpdateAvailable(current, latest) : false,
      belowMinimum: minVersion ? !meetsMinVersion(current, minVersion) : false,
      notes: data.notes?.trim() || null,
      checkedAt,
      source: "license-server",
    };
  } catch {
    return {
      current,
      latest: null,
      minVersion: null,
      upToDate: true,
      updateAvailable: false,
      belowMinimum: false,
      notes: null,
      checkedAt,
      source: "unreachable",
    };
  }
}
