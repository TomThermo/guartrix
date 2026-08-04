import { request } from "./client";

export type PanelSettings = {
  publicHost: string;
  publicBaseUrl: string;
  registrationEnabled: boolean;
  defaultMaxServers: number;
  defaultMaxMemoryMb: number;
  defaultMaxDatabases: number;
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
};

export type PanelSettingsPatch = {
  publicHost?: string;
  publicBaseUrl?: string;
  registrationEnabled?: boolean;
  defaultMaxServers?: number;
  defaultMaxMemoryMb?: number;
  defaultMaxDatabases?: number;
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
};

export const adminSettingsApi = {
  getPanelSettings: () => request<PanelSettings>("/api/admin/settings"),
  updatePanelSettings: (body: PanelSettingsPatch) =>
    request<PanelSettings>("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testPanelMail: () =>
    request<{
      ok: boolean;
      delivered: boolean;
      to: string;
      outboxPath: string;
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
};
