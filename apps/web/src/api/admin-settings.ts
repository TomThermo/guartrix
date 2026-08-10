import { request, withCsrfHeaders, ApiError, refreshCsrfToken } from "./client";

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
  mailLogoHeight: number;
  mailLogoMaxWidth: number;
  mailLogoAlign: "left" | "center";
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
  brandingLogoUploaded?: boolean;
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
  mailLogoHeight?: number;
  mailLogoMaxWidth?: number;
  mailLogoAlign?: "left" | "center";
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

export type MailTemplateId =
  | "verify-email"
  | "password-reset"
  | "invite-set-password"
  | "invite-server"
  | "alert"
  | "test-mail";

export type MailTemplateParts = {
  subject: string;
  html: string;
  text: string;
};

export type MailTemplatesAdminView = {
  ids: MailTemplateId[];
  layoutHtml: string;
  layoutTxt: string;
  layoutHtmlCustom: boolean;
  layoutTxtCustom: boolean;
  templates: Record<
    MailTemplateId,
    MailTemplateParts & { custom: { subject: boolean; html: boolean; text: boolean } }
  >;
};

export type MailTemplatesPatch = {
  layoutHtml?: string | null;
  layoutTxt?: string | null;
  templates?: Partial<Record<MailTemplateId, Partial<MailTemplateParts> | null>>;
  resetAll?: boolean;
  resetId?: MailTemplateId;
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
  getMailTemplates: () => request<MailTemplatesAdminView>("/api/admin/settings/mail-templates"),
  updateMailTemplates: (body: MailTemplatesPatch) =>
    request<MailTemplatesAdminView>("/api/admin/settings/mail-templates", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  previewMailTemplate: (
    id: string,
    draft?: Partial<
      Pick<MailTemplateParts, "subject" | "html" | "text"> & {
        layoutHtml: string;
        layoutTxt: string;
      }
    >,
  ) =>
    request<{ ok: boolean; id: string; subject: string; text: string; html: string }>(
      "/api/admin/settings/mail-templates/preview",
      {
        method: "POST",
        body: JSON.stringify({ id, ...draft }),
      },
    ),
  uploadBrandingLogo: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const run = async () => {
      const res = await fetch("/api/admin/settings/branding/logo", {
        method: "POST",
        credentials: "include",
        headers: withCsrfHeaders(),
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    };
    let { res, data } = await run();
    if (
      !res.ok &&
      res.status === 403 &&
      typeof data.error === "string" &&
      /csrf token/i.test(data.error)
    ) {
      if (await refreshCsrfToken()) {
        ({ res, data } = await run());
      }
    }
    if (!res.ok) {
      throw new ApiError(
        typeof data.error === "string" ? data.error : res.statusText,
        res.status,
      );
    }
    return data as { ok: boolean; appLogo: string; brandingLogoUploaded: boolean };
  },
  deleteBrandingLogo: () =>
    request<{ ok: boolean; appLogo: string; brandingLogoUploaded: boolean }>(
      "/api/admin/settings/branding/logo",
      { method: "DELETE" },
    ),
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
