/**
 * Admin panel settings stored in data/panel-settings.json.
 * Env remains the baseline; this file overrides selected keys at runtime
 * and syncs web/HTTPS-related keys back into .env (restart required).
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { clampBackupKeepCount } from "@msm/shared";
import { config } from "./config.js";

const SETTINGS_FILE = "panel-settings.json";
const SECRET_UNCHANGED = "";

export type PanelSettingsStored = {
  publicHost?: string;
  publicBaseUrl?: string;
  registrationEnabled?: boolean;
  defaultMaxServers?: number;
  defaultMaxMemoryMb?: number;
  defaultMaxDatabases?: number;
  defaultBackupKeepCount?: number;
  cloudflareDomain?: string;
  cloudflareZoneId?: string;
  cloudflareApiToken?: string;
  mailFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpStartTls?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  httpsEnabled?: boolean;
  sessionSecure?: boolean;
  twoFactorRequiredRoles?: string[];
  activityWebhookUrl?: string;
  alertEmail?: string;
  activityAlertMute?: string[];
  backupOffsiteCmd?: string;
  /** White-label / Pelican-style branding & misc (Admin → Settings). */
  appName?: string;
  appLogo?: string;
  appFavicon?: string;
  debugMode?: boolean;
  unitPrefix?: "binary" | "decimal";
  navigationType?: "sidebar" | "topbar" | "mixed";
  displayWidth?: "xl" | "2xl" | "full";
  trustProxy?: boolean;
  trustedProxies?: string;
  /** Operator SLA attestations (Admin → Go-live). ISO dates / booleans. */
  slaRestoreDrillAt?: string | null;
  slaIncidentRunbookAck?: boolean;
  slaPentestAck?: boolean;
  slaCapacityReviewAt?: string | null;
  slaSecretRotationAt?: string | null;
  /** Cloudflare Turnstile on login / register. */
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
};

/** Public GET shape — secrets masked. */
export type PanelSettingsView = {
  publicHost: string;
  publicBaseUrl: string;
  registrationEnabled: boolean;
  defaultMaxServers: number;
  defaultMaxMemoryMb: number;
  defaultMaxDatabases: number;
  defaultBackupKeepCount: number;
  cloudflareDomain: string;
  cloudflareZoneId: string;
  cloudflareApiTokenSet: boolean;
  cloudflareApiTokenMasked: string;
  mailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpStartTls: boolean;
  smtpUser: string;
  smtpPassSet: boolean;
  smtpConfigured: boolean;
  httpsEnabled: boolean;
  sessionSecure: boolean;
  twoFactorRequiredRoles: string[];
  activityWebhookUrl: string;
  alertEmail: string;
  activityAlertMute: string[];
  backupOffsiteCmd: string;
  backupOffsiteCmdSet: boolean;
  appName: string;
  appLogo: string;
  appFavicon: string;
  debugMode: boolean;
  unitPrefix: "binary" | "decimal";
  navigationType: "sidebar" | "topbar" | "mixed";
  displayWidth: "xl" | "2xl" | "full";
  trustProxy: boolean;
  trustedProxies: string;
  /** Redis HA status (read-only; configure via install / .env). */
  redis: {
    configured: boolean;
    enabled: boolean;
    connected: boolean;
    urlMasked: string | null;
    latencyMs: number | null;
    error: string | null;
    sessionStore: string;
    rateLimitStore: string;
  };
  /** Keys that need `bash build/start.sh` after change. */
  restartRequiredKeys: string[];
  slaRestoreDrillAt: string | null;
  slaIncidentRunbookAck: boolean;
  slaPentestAck: boolean;
  slaCapacityReviewAt: string | null;
  slaSecretRotationAt: string | null;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretKeySet: boolean;
};

const ENV_SYNC_KEYS = [
  "PUBLIC_HOST",
  "PUBLIC_BASE_URL",
  "SESSION_SECURE",
  "HTTPS_ENABLED",
  "TRUST_PROXY",
  "TRUSTED_PROXIES",
  "APP_NAME",
] as const;

function settingsPath(): string {
  return path.join(config.dataDir, SETTINGS_FILE);
}

function envPath(): string {
  return path.join(config.rootDir, ".env");
}

function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, v.length - 4))}${v.slice(-4)}`;
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw === "true";
}

function readStoredSync(): PanelSettingsStored {
  const file = settingsPath();
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as PanelSettingsStored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[guartrix] Failed to read panel-settings.json — using env only");
    return {};
  }
}

export async function readStoredSettings(): Promise<PanelSettingsStored> {
  const file = settingsPath();
  try {
    const raw = await fsPromises.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PanelSettingsStored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    console.warn("[guartrix] Failed to read panel-settings.json:", err);
    return {};
  }
}

export async function writeStoredSettings(
  next: PanelSettingsStored,
): Promise<void> {
  await fsPromises.mkdir(config.dataDir, { recursive: true });
  const tmp = `${settingsPath()}.tmp`;
  await fsPromises.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  await fsPromises.rename(tmp, settingsPath());
}

/** Apply stored overrides onto the mutable `config` object. */
export function applyPanelSettings(stored: PanelSettingsStored): void {
  if (stored.publicHost !== undefined) {
    config.publicHost = String(stored.publicHost).trim() || config.publicHost;
  }
  if (stored.publicBaseUrl !== undefined) {
    config.publicBaseUrl =
      String(stored.publicBaseUrl).trim() || config.publicBaseUrl;
  }
  if (stored.registrationEnabled !== undefined) {
    config.registrationEnabled = Boolean(stored.registrationEnabled);
  }
  if (stored.defaultMaxServers !== undefined) {
    config.defaultMaxServers = Math.max(0, Number(stored.defaultMaxServers) || 0);
  }
  if (stored.defaultMaxMemoryMb !== undefined) {
    config.defaultMaxMemoryMb = Math.max(
      0,
      Number(stored.defaultMaxMemoryMb) || 0,
    );
  }
  if (stored.defaultMaxDatabases !== undefined) {
    config.defaultMaxDatabases = Math.max(
      0,
      Number(stored.defaultMaxDatabases) || 0,
    );
  }
  if (stored.defaultBackupKeepCount !== undefined) {
    config.defaultBackupKeepCount = clampBackupKeepCount(
      stored.defaultBackupKeepCount,
    );
  }
  if (stored.cloudflareDomain !== undefined) {
    config.cloudflare.domain = String(stored.cloudflareDomain)
      .trim()
      .replace(/^\.+|\.+$/g, "");
  }
  if (stored.cloudflareZoneId !== undefined) {
    config.cloudflare.zoneId = String(stored.cloudflareZoneId).trim();
  }
  if (stored.cloudflareApiToken !== undefined) {
    config.cloudflare.apiToken = String(stored.cloudflareApiToken);
  }
  if (stored.mailFrom !== undefined) {
    config.mail.from =
      String(stored.mailFrom).trim() || "noreply@guartrix.com";
  }
  if (stored.smtpHost !== undefined) {
    config.mail.smtpHost = String(stored.smtpHost).trim();
  }
  if (stored.smtpPort !== undefined) {
    config.mail.smtpPort = Number(stored.smtpPort) || 465;
  }
  if (stored.smtpSecure !== undefined) {
    config.mail.smtpSecure = Boolean(stored.smtpSecure);
  }
  if (stored.smtpStartTls !== undefined) {
    config.mail.smtpStartTls = Boolean(stored.smtpStartTls);
  }
  if (stored.smtpUser !== undefined) {
    config.mail.smtpUser = String(stored.smtpUser).trim();
  }
  if (stored.smtpPass !== undefined) {
    config.mail.smtpPass = String(stored.smtpPass);
  }
  if (stored.sessionSecure !== undefined) {
    config.sessionSecure = Boolean(stored.sessionSecure);
  }
  if (stored.twoFactorRequiredRoles !== undefined) {
    config.twoFactorRequiredRoles = stored.twoFactorRequiredRoles
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean);
  }
  if (stored.activityWebhookUrl !== undefined) {
    config.alerts.webhookUrl = String(stored.activityWebhookUrl).trim();
  }
  if (stored.alertEmail !== undefined) {
    config.alerts.alertEmail = String(stored.alertEmail).trim();
  }
  if (stored.activityAlertMute !== undefined) {
    config.alerts.mutedActions = stored.activityAlertMute
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  if (stored.backupOffsiteCmd !== undefined) {
    config.backupOffsiteCmd = String(stored.backupOffsiteCmd).trim();
  }
  if (stored.appName !== undefined) {
    config.appName = String(stored.appName).trim().slice(0, 64) || "Guartrix";
  }
  if (stored.appLogo !== undefined) {
    config.appLogo = String(stored.appLogo).trim();
  }
  if (stored.appFavicon !== undefined) {
    config.appFavicon = String(stored.appFavicon).trim() || "/favicon.ico";
  }
  if (stored.debugMode !== undefined) {
    config.debugMode = Boolean(stored.debugMode);
  }
  if (stored.unitPrefix !== undefined) {
    config.unitPrefix =
      stored.unitPrefix === "decimal" ? "decimal" : "binary";
  }
  if (stored.navigationType !== undefined) {
    const v = stored.navigationType;
    config.navigationType =
      v === "sidebar" || v === "topbar" || v === "mixed" ? v : "mixed";
  }
  if (stored.displayWidth !== undefined) {
    const v = stored.displayWidth;
    config.displayWidth = v === "2xl" || v === "full" || v === "xl" ? v : "xl";
  }
  if (stored.trustProxy !== undefined) {
    config.trustProxy = Boolean(stored.trustProxy);
    process.env.TRUST_PROXY = stored.trustProxy ? "1" : "0";
  }
  if (stored.trustedProxies !== undefined) {
    config.trustedProxies = String(stored.trustedProxies).trim();
    process.env.TRUSTED_PROXIES = config.trustedProxies;
  }
  // Track HTTPS for GET view / env sync (prod-web still needs restart).
  if (stored.httpsEnabled !== undefined) {
    process.env.HTTPS_ENABLED = stored.httpsEnabled ? "true" : "false";
  }
  if (stored.turnstileEnabled !== undefined) {
    config.turnstile.enabled = Boolean(stored.turnstileEnabled);
  }
  if (stored.turnstileSiteKey !== undefined) {
    config.turnstile.siteKey = String(stored.turnstileSiteKey).trim();
  }
  if (stored.turnstileSecretKey !== undefined) {
    config.turnstile.secretKey = String(stored.turnstileSecretKey);
  }
}

export function loadAndApplyPanelSettings(): void {
  applyPanelSettings(readStoredSync());
}

function currentHttpsEnabled(): boolean {
  return parseBoolEnv(process.env.HTTPS_ENABLED, true);
}

export async function getPanelSettingsView(): Promise<PanelSettingsView> {
  const { getRedisStatus } = await import("./redis.js");
  const redis = await getRedisStatus();
  const stored = await readStoredSettings();
  return {
    publicHost: config.publicHost,
    publicBaseUrl: config.publicBaseUrl,
    registrationEnabled: config.registrationEnabled,
    defaultMaxServers: config.defaultMaxServers,
    defaultMaxMemoryMb: config.defaultMaxMemoryMb,
    defaultMaxDatabases: config.defaultMaxDatabases,
    defaultBackupKeepCount: config.defaultBackupKeepCount,
    cloudflareDomain: config.cloudflare.domain,
    cloudflareZoneId: config.cloudflare.zoneId,
    cloudflareApiTokenSet: Boolean(config.cloudflare.apiToken),
    cloudflareApiTokenMasked: maskSecret(config.cloudflare.apiToken),
    mailFrom: config.mail.from,
    smtpHost: config.mail.smtpHost,
    smtpPort: config.mail.smtpPort,
    smtpSecure: config.mail.smtpSecure,
    smtpStartTls: config.mail.smtpStartTls,
    smtpUser: config.mail.smtpUser,
    smtpPassSet: Boolean(config.mail.smtpPass),
    smtpConfigured: Boolean(config.mail.smtpHost),
    httpsEnabled: currentHttpsEnabled(),
    sessionSecure: config.sessionSecure,
    twoFactorRequiredRoles: [...config.twoFactorRequiredRoles],
    activityWebhookUrl: config.alerts.webhookUrl,
    alertEmail: config.alerts.alertEmail,
    activityAlertMute: [...config.alerts.mutedActions],
    backupOffsiteCmd: config.backupOffsiteCmd,
    backupOffsiteCmdSet: Boolean(config.backupOffsiteCmd),
    appName: config.appName,
    appLogo: config.appLogo,
    appFavicon: config.appFavicon,
    debugMode: config.debugMode,
    unitPrefix: config.unitPrefix,
    navigationType: config.navigationType,
    displayWidth: config.displayWidth,
    trustProxy: config.trustProxy,
    trustedProxies: config.trustedProxies,
    redis: {
      configured: redis.configured,
      enabled: redis.enabled,
      connected: redis.connected,
      urlMasked: redis.urlMasked,
      latencyMs: redis.latencyMs,
      error: redis.error,
      sessionStore: redis.sessionStore,
      rateLimitStore: redis.rateLimitStore,
    },
    restartRequiredKeys: [...ENV_SYNC_KEYS],
    slaRestoreDrillAt: stored.slaRestoreDrillAt ?? null,
    slaIncidentRunbookAck: Boolean(stored.slaIncidentRunbookAck),
    slaPentestAck: Boolean(stored.slaPentestAck),
    slaCapacityReviewAt: stored.slaCapacityReviewAt ?? null,
    slaSecretRotationAt: stored.slaSecretRotationAt ?? null,
    turnstileEnabled: config.turnstile.enabled,
    turnstileSiteKey: config.turnstile.siteKey,
    turnstileSecretKeySet: Boolean(config.turnstile.secretKey),
  };
}

export type PanelSettingsPatch = {
  publicHost?: string;
  publicBaseUrl?: string;
  registrationEnabled?: boolean;
  defaultMaxServers?: number;
  defaultMaxMemoryMb?: number;
  defaultMaxDatabases?: number;
  defaultBackupKeepCount?: number;
  cloudflareDomain?: string;
  cloudflareZoneId?: string;
  /** Empty / omit = leave unchanged; non-empty = set. */
  cloudflareApiToken?: string;
  mailFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpStartTls?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  httpsEnabled?: boolean;
  sessionSecure?: boolean;
  twoFactorRequiredRoles?: string[];
  activityWebhookUrl?: string;
  alertEmail?: string;
  activityAlertMute?: string[] | string;
  backupOffsiteCmd?: string;
  appName?: string;
  appLogo?: string;
  appFavicon?: string;
  debugMode?: boolean;
  unitPrefix?: "binary" | "decimal";
  navigationType?: "sidebar" | "topbar" | "mixed";
  displayWidth?: "xl" | "2xl" | "full";
  trustProxy?: boolean;
  trustedProxies?: string;
  slaRestoreDrillAt?: string | null;
  slaIncidentRunbookAck?: boolean;
  slaPentestAck?: boolean;
  slaCapacityReviewAt?: string | null;
  slaSecretRotationAt?: string | null;
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string;
  /** Empty / omit = leave unchanged; non-empty = set. */
  turnstileSecretKey?: string;
};

function asNonNegInt(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return n;
}

/** Merge patch into stored JSON; empty secrets keep previous. */
export function mergePanelSettingsPatch(
  current: PanelSettingsStored,
  patch: PanelSettingsPatch,
): PanelSettingsStored {
  const next: PanelSettingsStored = { ...current };

  if (patch.publicHost !== undefined) {
    const v = String(patch.publicHost).trim();
    if (!v) throw new Error("publicHost is required");
    next.publicHost = v;
  }
  if (patch.publicBaseUrl !== undefined) {
    const v = String(patch.publicBaseUrl).trim();
    if (!v) throw new Error("publicBaseUrl is required");
    try {
      // eslint-disable-next-line no-new
      new URL(v);
    } catch {
      throw new Error("publicBaseUrl must be a valid URL");
    }
    next.publicBaseUrl = v.replace(/\/$/, "");
  }
  if (patch.registrationEnabled !== undefined) {
    next.registrationEnabled = Boolean(patch.registrationEnabled);
  }
  if (patch.defaultMaxServers !== undefined) {
    next.defaultMaxServers = asNonNegInt(
      patch.defaultMaxServers,
      "defaultMaxServers",
    );
  }
  if (patch.defaultMaxMemoryMb !== undefined) {
    next.defaultMaxMemoryMb = asNonNegInt(
      patch.defaultMaxMemoryMb,
      "defaultMaxMemoryMb",
    );
  }
  if (patch.defaultMaxDatabases !== undefined) {
    next.defaultMaxDatabases = asNonNegInt(
      patch.defaultMaxDatabases,
      "defaultMaxDatabases",
    );
  }
  if (patch.defaultBackupKeepCount !== undefined) {
    next.defaultBackupKeepCount = clampBackupKeepCount(
      patch.defaultBackupKeepCount,
    );
  }
  if (patch.cloudflareDomain !== undefined) {
    next.cloudflareDomain = String(patch.cloudflareDomain)
      .trim()
      .replace(/^\.+|\.+$/g, "");
  }
  if (patch.cloudflareZoneId !== undefined) {
    next.cloudflareZoneId = String(patch.cloudflareZoneId).trim();
  }
  if (patch.cloudflareApiToken !== undefined) {
    const token = String(patch.cloudflareApiToken);
    if (token !== SECRET_UNCHANGED && token.trim() !== "") {
      next.cloudflareApiToken = token.trim();
    }
  }
  if (patch.mailFrom !== undefined) {
    next.mailFrom = String(patch.mailFrom).trim();
  }
  if (patch.smtpHost !== undefined) {
    next.smtpHost = String(patch.smtpHost).trim();
  }
  if (patch.smtpPort !== undefined) {
    const port = Number(patch.smtpPort);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error("smtpPort must be 1–65535");
    }
    next.smtpPort = Math.floor(port);
  }
  if (patch.smtpSecure !== undefined) {
    next.smtpSecure = Boolean(patch.smtpSecure);
  }
  if (patch.smtpStartTls !== undefined) {
    next.smtpStartTls = Boolean(patch.smtpStartTls);
  }
  if (patch.smtpUser !== undefined) {
    next.smtpUser = String(patch.smtpUser).trim();
  }
  if (patch.smtpPass !== undefined) {
    const pass = String(patch.smtpPass);
    if (pass !== SECRET_UNCHANGED) {
      next.smtpPass = pass;
    }
  }
  if (patch.httpsEnabled !== undefined) {
    next.httpsEnabled = Boolean(patch.httpsEnabled);
  }
  if (patch.sessionSecure !== undefined) {
    next.sessionSecure = Boolean(patch.sessionSecure);
  }
  if (patch.twoFactorRequiredRoles !== undefined) {
    const allowed = new Set(["ADMIN", "OPERATOR", "VIEWER"]);
    next.twoFactorRequiredRoles = patch.twoFactorRequiredRoles
      .map((s) => String(s).trim().toUpperCase())
      .filter((s) => allowed.has(s));
  }
  if (patch.activityWebhookUrl !== undefined) {
    next.activityWebhookUrl = String(patch.activityWebhookUrl).trim();
  }
  if (patch.alertEmail !== undefined) {
    next.alertEmail = String(patch.alertEmail).trim();
  }
  if (patch.activityAlertMute !== undefined) {
    const raw = patch.activityAlertMute;
    const list = Array.isArray(raw)
      ? raw
      : String(raw)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    next.activityAlertMute = list;
  }
  if (patch.backupOffsiteCmd !== undefined) {
    next.backupOffsiteCmd = String(patch.backupOffsiteCmd).trim();
  }
  if (patch.appName !== undefined) {
    const v = String(patch.appName).trim().slice(0, 64);
    if (!v) throw new Error("appName is required");
    next.appName = v;
  }
  if (patch.appLogo !== undefined) {
    next.appLogo = String(patch.appLogo).trim().slice(0, 500);
  }
  if (patch.appFavicon !== undefined) {
    next.appFavicon = String(patch.appFavicon).trim().slice(0, 500) || "/favicon.ico";
  }
  if (patch.debugMode !== undefined) {
    next.debugMode = Boolean(patch.debugMode);
  }
  if (patch.unitPrefix !== undefined) {
    next.unitPrefix = patch.unitPrefix === "decimal" ? "decimal" : "binary";
  }
  if (patch.navigationType !== undefined) {
    const v = patch.navigationType;
    if (v !== "sidebar" && v !== "topbar" && v !== "mixed") {
      throw new Error("navigationType must be sidebar, topbar, or mixed");
    }
    next.navigationType = v;
  }
  if (patch.displayWidth !== undefined) {
    const v = patch.displayWidth;
    if (v !== "xl" && v !== "2xl" && v !== "full") {
      throw new Error("displayWidth must be xl, 2xl, or full");
    }
    next.displayWidth = v;
  }
  if (patch.trustProxy !== undefined) {
    next.trustProxy = Boolean(patch.trustProxy);
  }
  if (patch.trustedProxies !== undefined) {
    next.trustedProxies = String(patch.trustedProxies)
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(",");
  }
  if (patch.slaRestoreDrillAt !== undefined) {
    const v = patch.slaRestoreDrillAt;
    next.slaRestoreDrillAt =
      v === null || v === "" ? null : String(v).trim();
  }
  if (patch.slaIncidentRunbookAck !== undefined) {
    next.slaIncidentRunbookAck = Boolean(patch.slaIncidentRunbookAck);
  }
  if (patch.slaPentestAck !== undefined) {
    next.slaPentestAck = Boolean(patch.slaPentestAck);
  }
  if (patch.slaCapacityReviewAt !== undefined) {
    const v = patch.slaCapacityReviewAt;
    next.slaCapacityReviewAt =
      v === null || v === "" ? null : String(v).trim();
  }
  if (patch.slaSecretRotationAt !== undefined) {
    const v = patch.slaSecretRotationAt;
    next.slaSecretRotationAt =
      v === null || v === "" ? null : String(v).trim();
  }
  if (patch.turnstileEnabled !== undefined) {
    next.turnstileEnabled = Boolean(patch.turnstileEnabled);
  }
  if (patch.turnstileSiteKey !== undefined) {
    next.turnstileSiteKey = String(patch.turnstileSiteKey).trim();
  }
  if (patch.turnstileSecretKey !== undefined) {
    const secret = String(patch.turnstileSecretKey);
    if (secret !== SECRET_UNCHANGED) {
      next.turnstileSecretKey = secret.trim();
    }
  }

  return next;
}

function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const trimmed = content.endsWith("\n") ? content : `${content}\n`;
  return `${trimmed}\n# Synced from Admin → Settings\n${line}\n`;
}

/** Sync web/HTTPS keys into live `.env` so prod-web picks them up after restart. */
export async function syncEnvFromSettings(
  stored: PanelSettingsStored,
): Promise<string[]> {
  const changed: string[] = [];
  const file = envPath();
  let content: string;
  try {
    content = await fsPromises.readFile(file, "utf8");
  } catch {
    console.warn("[guartrix] .env missing — skip env sync for panel settings");
    return changed;
  }

  const updates: Array<[string, string | undefined]> = [
    ["PUBLIC_HOST", stored.publicHost],
    ["PUBLIC_BASE_URL", stored.publicBaseUrl],
    [
      "SESSION_SECURE",
      stored.sessionSecure === undefined
        ? undefined
        : stored.sessionSecure
          ? "true"
          : "false",
    ],
    [
      "HTTPS_ENABLED",
      stored.httpsEnabled === undefined
        ? undefined
        : stored.httpsEnabled
          ? "true"
          : "false",
    ],
    [
      "TRUST_PROXY",
      stored.trustProxy === undefined
        ? undefined
        : stored.trustProxy
          ? "1"
          : "0",
    ],
    ["TRUSTED_PROXIES", stored.trustedProxies],
    ["APP_NAME", stored.appName],
  ];

  let next = content;
  for (const [key, value] of updates) {
    if (value === undefined) continue;
    const before = next;
    next = setEnvLine(next, key, value);
    if (next !== before) changed.push(key);
  }

  if (changed.length > 0) {
    const tmp = `${file}.tmp`;
    await fsPromises.writeFile(tmp, next, { mode: 0o600 });
    await fsPromises.rename(tmp, file);
  }
  return changed;
}

export function restartRequiredForPatch(patch: PanelSettingsPatch): boolean {
  return (
    patch.publicHost !== undefined ||
    patch.publicBaseUrl !== undefined ||
    patch.httpsEnabled !== undefined ||
    patch.sessionSecure !== undefined ||
    patch.trustProxy !== undefined ||
    patch.trustedProxies !== undefined
  );
}

/** Unauthenticated branding/layout prefs for the web shell. */
export function getPublicBranding() {
  return {
    appName: config.appName,
    appLogo: config.appLogo,
    appFavicon: config.appFavicon || "/favicon.ico",
    unitPrefix: config.unitPrefix,
    navigationType: config.navigationType,
    displayWidth: config.displayWidth,
    debugMode: config.debugMode,
  };
}
