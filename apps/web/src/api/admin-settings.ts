import { request } from "./client";

export type PanelSettings = {
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
  restartRequiredKeys: string[];
  restartRequired?: boolean;
  envChanged?: string[];
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
  turnstileSecretKey?: string;
};

export type ReadinessCheck = {
  id: string;
  tone: "pass" | "warn" | "fail" | "info";
  tab?: "general" | "mail" | "backup" | "security" | "misc" | "alerts" | "golive";
  detail?: string;
};

export type ReadinessReport = {
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number; info: number };
  checks: ReadinessCheck[];
  sla: {
    restoreDrillAt?: string | null;
    incidentRunbookAck?: boolean;
    pentestScheduledOrDone?: boolean;
    capacityReviewAt?: string | null;
    secretRotationAt?: string | null;
  };
  jobs?: {
    mode: "bullmq" | "in_process";
    redisRequired: boolean;
    queues?: Array<{
      name: string;
      waiting: number;
      active: number;
      failed: number;
      delayed: number;
    }>;
  };
};

export const adminSettingsApi = {
  getPanelSettings: () => request<PanelSettings>("/api/admin/settings"),
  updatePanelSettings: (body: PanelSettingsPatch) =>
    request<PanelSettings>("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getAdminReadiness: () => request<ReadinessReport>("/api/admin/readiness"),
  getAdminJobs: () => request<NonNullable<ReadinessReport["jobs"]>>("/api/admin/jobs"),
  testPanelMail: () =>
    request<{
      ok: boolean;
      delivered: boolean;
      to: string;
      outboxPath: string;
      error?: string;
    }>("/api/admin/settings/test-mail", {
      method: "POST",
      body: "{}",
    }),
  testPanelRedis: () =>
    request<{
      ok: boolean;
      configured: boolean;
      enabled: boolean;
      connected: boolean;
      urlMasked: string | null;
      latencyMs: number | null;
      error: string | null;
      sessionStore: string;
      rateLimitStore: string;
    }>("/api/admin/settings/test-redis", {
      method: "POST",
      body: "{}",
    }),
  getAdminNavCounts: () =>
    request<{ servers: number; nodes: number; users: number }>("/api/admin/nav-counts"),
};
