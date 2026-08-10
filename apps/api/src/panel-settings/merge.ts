import { clampBackupKeepCount } from "@guartrix/shared";
import { SECRET_UNCHANGED, type PanelSettingsPatch, type PanelSettingsStored } from "./types.js";

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
    next.defaultMaxServers = asNonNegInt(patch.defaultMaxServers, "defaultMaxServers");
  }
  if (patch.defaultMaxMemoryMb !== undefined) {
    next.defaultMaxMemoryMb = asNonNegInt(patch.defaultMaxMemoryMb, "defaultMaxMemoryMb");
  }
  if (patch.defaultMaxDatabases !== undefined) {
    next.defaultMaxDatabases = asNonNegInt(patch.defaultMaxDatabases, "defaultMaxDatabases");
  }
  if (patch.defaultBackupKeepCount !== undefined) {
    next.defaultBackupKeepCount = clampBackupKeepCount(patch.defaultBackupKeepCount);
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
    next.slaRestoreDrillAt = v === null || v === "" ? null : String(v).trim();
  }
  if (patch.slaIncidentRunbookAck !== undefined) {
    next.slaIncidentRunbookAck = Boolean(patch.slaIncidentRunbookAck);
  }
  if (patch.slaPentestAck !== undefined) {
    next.slaPentestAck = Boolean(patch.slaPentestAck);
  }
  if (patch.slaCapacityReviewAt !== undefined) {
    const v = patch.slaCapacityReviewAt;
    next.slaCapacityReviewAt = v === null || v === "" ? null : String(v).trim();
  }
  if (patch.slaSecretRotationAt !== undefined) {
    const v = patch.slaSecretRotationAt;
    next.slaSecretRotationAt = v === null || v === "" ? null : String(v).trim();
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
