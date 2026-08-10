import { clampBackupKeepCount } from "@guartrix/shared";
import { config } from "../config.js";
import { readStoredSync } from "./io.js";
import type { PanelSettingsStored } from "./types.js";

/** Apply stored overrides onto the mutable `config` object. */
export function applyPanelSettings(stored: PanelSettingsStored): void {
  if (stored.publicHost !== undefined) {
    config.publicHost = String(stored.publicHost).trim() || config.publicHost;
  }
  if (stored.publicBaseUrl !== undefined) {
    config.publicBaseUrl = String(stored.publicBaseUrl).trim() || config.publicBaseUrl;
  }
  if (stored.registrationEnabled !== undefined) {
    config.registrationEnabled = Boolean(stored.registrationEnabled);
  }
  if (stored.defaultMaxServers !== undefined) {
    config.defaultMaxServers = Math.max(0, Number(stored.defaultMaxServers) || 0);
  }
  if (stored.defaultMaxMemoryMb !== undefined) {
    config.defaultMaxMemoryMb = Math.max(0, Number(stored.defaultMaxMemoryMb) || 0);
  }
  if (stored.defaultMaxDatabases !== undefined) {
    config.defaultMaxDatabases = Math.max(0, Number(stored.defaultMaxDatabases) || 0);
  }
  if (stored.defaultBackupKeepCount !== undefined) {
    config.defaultBackupKeepCount = clampBackupKeepCount(stored.defaultBackupKeepCount);
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
    config.mail.from = String(stored.mailFrom).trim() || "noreply@guartrix.com";
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
    config.unitPrefix = stored.unitPrefix === "decimal" ? "decimal" : "binary";
  }
  if (stored.navigationType !== undefined) {
    const v = stored.navigationType;
    config.navigationType = v === "sidebar" || v === "topbar" || v === "mixed" ? v : "mixed";
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
