import { config } from "../config.js";
import { readStoredSettings } from "./io.js";
import { ENV_SYNC_KEYS, type PanelSettingsView } from "./types.js";

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

function currentHttpsEnabled(): boolean {
  return parseBoolEnv(process.env.HTTPS_ENABLED, true);
}

export async function getPanelSettingsView(): Promise<PanelSettingsView> {
  const { getRedisStatus } = await import("../redis.js");
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
