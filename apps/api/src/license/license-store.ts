import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";

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

export const LICENSE_CACHE_MS = Math.max(
  60_000,
  Number(process.env.LICENSE_VALIDATE_INTERVAL_MS ?? 10 * 60 * 1000),
);

const KEY_FILE = () => path.join(config.dataDir, "license-key");
const INSTALL_ID_FILE = () => path.join(config.dataDir, "license-install-id");
const SERVER_URL_FILE = () => path.join(config.dataDir, "license-server-url");
const LAST_OK_FILE = () => path.join(config.dataDir, "license-last-ok");
export const LICENSE_PUBLIC_KEY_FILE = () =>
  path.join(config.dataDir, "licenses", "signing-public.pem");

let cached: LicenseState | null = null;
let cachedAt = 0;
/** In-memory override after admin saves (avoids re-reading disk every call). */
let serverUrlOverride: string | null | undefined = undefined;
let licenseKeyClearedHandler:
  | ((state: LicenseState) => Promise<void>)
  | undefined;

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
    invalidateLicenseCache();
    return defaultLicenseServerUrl();
  }
  const normalized = parseLicenseServerUrl(url);
  await fs.writeFile(SERVER_URL_FILE(), normalized + "\n", { mode: 0o600 });
  serverUrlOverride = normalized;
  invalidateLicenseCache();
  return normalized;
}

export function maskLicenseKey(key: string): string {
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
  invalidateLicenseCache();
}

/** Remove the license key — panel drops to the unlicensed free tier. */
export async function clearLicenseKey(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  // Empty file (not deletion) so a LICENSE_KEY left in .env does not resurface.
  await fs.writeFile(KEY_FILE(), "", { mode: 0o600 });
  await fs.rm(LAST_OK_FILE(), { force: true });
  invalidateLicenseCache();
  await licenseKeyClearedHandler?.({
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

export async function markLicenseOk(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(LAST_OK_FILE(), String(Date.now()) + "\n", { mode: 0o600 });
}

export async function lastLicenseOkAt(): Promise<number | null> {
  try {
    const raw = (await fs.readFile(LAST_OK_FILE(), "utf8")).trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getCachedLicenseState(): LicenseState | null {
  return cached;
}

export function getLicenseCacheEntry(): {
  state: LicenseState | null;
  cachedAt: number;
} {
  return { state: cached, cachedAt };
}

export function setCachedLicenseState(
  state: LicenseState,
  at = Date.now(),
): LicenseState {
  cached = state;
  cachedAt = at;
  return state;
}

export function invalidateLicenseCache(): void {
  cached = null;
  cachedAt = 0;
}

export function registerLicenseKeyClearedHandler(
  handler: (state: LicenseState) => Promise<void>,
): void {
  licenseKeyClearedHandler = handler;
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
