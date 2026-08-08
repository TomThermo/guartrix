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
  /** White-label branding & misc (Admin → Settings). */
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

export const SETTINGS_FILE = "panel-settings.json";
export const SECRET_UNCHANGED = "";

export const ENV_SYNC_KEYS = [
  "PUBLIC_HOST",
  "PUBLIC_BASE_URL",
  "SESSION_SECURE",
  "HTTPS_ENABLED",
  "TRUST_PROXY",
  "TRUSTED_PROXIES",
  "APP_NAME",
] as const;
