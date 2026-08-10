import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type PanelSettings } from "../../api";
import type { ReadinessReport } from "../../api/admin-settings";
import { useI18n } from "../../i18n/react";

export type SettingsTab = "golive" | "general" | "mail" | "alerts" | "backup" | "misc";

export const SETTINGS_TABS: Array<{ id: SettingsTab; icon: string; labelKey: string }> = [
  { id: "general", icon: "fa-sliders", labelKey: "adminSettings.tabGeneral" },
  { id: "mail", icon: "fa-paper-plane", labelKey: "adminSettings.tabMail" },
  { id: "alerts", icon: "fa-bell", labelKey: "adminSettings.tabAlerts" },
  { id: "backup", icon: "fa-box-archive", labelKey: "adminSettings.tabBackup" },
  { id: "misc", icon: "fa-ellipsis", labelKey: "adminSettings.tabMisc" },
  { id: "golive", icon: "fa-rocket", labelKey: "adminSettings.tabGoLive" },
];

const SETTINGS_TAB_IDS = new Set<SettingsTab>(SETTINGS_TABS.map((t) => t.id));

export function parseSettingsTab(value: string | null): SettingsTab {
  if (value && SETTINGS_TAB_IDS.has(value as SettingsTab)) return value as SettingsTab;
  return "general";
}

export function useAdminSettings() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSettingsTab(searchParams.get("tab"));
  const setTab = (next: SettingsTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "general") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  };
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);

  const [appName, setAppName] = useState("Guartrix");
  const [appLogo, setAppLogo] = useState("");
  const [appFavicon, setAppFavicon] = useState("/favicon.ico");
  const [publicHost, setPublicHost] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [defaultMaxServers, setDefaultMaxServers] = useState(0);
  const [defaultMaxMemoryMb, setDefaultMaxMemoryMb] = useState(0);
  const [defaultMaxDatabases, setDefaultMaxDatabases] = useState(0);
  const [defaultBackupKeepCount, setDefaultBackupKeepCount] = useState(7);
  const [cloudflareDomain, setCloudflareDomain] = useState("");
  const [cloudflareZoneId, setCloudflareZoneId] = useState("");
  const [cloudflareApiToken, setCloudflareApiToken] = useState("");
  const [cloudflareApiTokenSet, setCloudflareApiTokenSet] = useState(false);

  const [mailFrom, setMailFrom] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpStartTls, setSmtpStartTls] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  const [debugMode, setDebugMode] = useState(false);
  const [unitPrefix, setUnitPrefix] = useState<"binary" | "decimal">("binary");
  const [navigationType, setNavigationType] = useState<"sidebar" | "topbar" | "mixed">("mixed");
  const [displayWidth, setDisplayWidth] = useState<"xl" | "2xl" | "full">("xl");

  const [activityWebhookUrl, setActivityWebhookUrl] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [activityAlertMute, setActivityAlertMute] = useState("");
  const [backupOffsiteCmd, setBackupOffsiteCmd] = useState("");
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [slaRestoreDrillAt, setSlaRestoreDrillAt] = useState("");
  const [slaCapacityReviewAt, setSlaCapacityReviewAt] = useState("");
  const [slaSecretRotationAt, setSlaSecretRotationAt] = useState("");
  const [slaIncidentRunbookAck, setSlaIncidentRunbookAck] = useState(false);
  const [slaPentestAck, setSlaPentestAck] = useState(false);

  const applyView = useCallback((s: PanelSettings) => {
    setAppName(s.appName || "Guartrix");
    setAppLogo(s.appLogo || "");
    setAppFavicon(s.appFavicon || "/favicon.ico");
    setPublicHost(s.publicHost);
    setPublicBaseUrl(s.publicBaseUrl);
    setRegistrationEnabled(s.registrationEnabled);
    setDefaultMaxServers(s.defaultMaxServers);
    setDefaultMaxMemoryMb(s.defaultMaxMemoryMb);
    setDefaultMaxDatabases(s.defaultMaxDatabases);
    setDefaultBackupKeepCount(s.defaultBackupKeepCount);
    setCloudflareDomain(s.cloudflareDomain);
    setCloudflareZoneId(s.cloudflareZoneId);
    setCloudflareApiTokenSet(s.cloudflareApiTokenSet);
    setCloudflareApiToken("");
    setMailFrom(s.mailFrom);
    setSmtpHost(s.smtpHost);
    setSmtpPort(s.smtpPort);
    setSmtpSecure(s.smtpSecure);
    setSmtpStartTls(s.smtpStartTls);
    setSmtpUser(s.smtpUser);
    setSmtpPass("");
    setSmtpPassSet(s.smtpPassSet);
    setSmtpConfigured(s.smtpConfigured);
    setDebugMode(Boolean(s.debugMode));
    setUnitPrefix(s.unitPrefix === "decimal" ? "decimal" : "binary");
    setNavigationType(
      s.navigationType === "sidebar" ||
        s.navigationType === "topbar" ||
        s.navigationType === "mixed"
        ? s.navigationType
        : "mixed",
    );
    setDisplayWidth(
      s.displayWidth === "2xl" || s.displayWidth === "full" || s.displayWidth === "xl"
        ? s.displayWidth
        : "xl",
    );
    setActivityWebhookUrl(s.activityWebhookUrl);
    setAlertEmail(s.alertEmail);
    setActivityAlertMute((s.activityAlertMute ?? []).join(", "));
    setBackupOffsiteCmd(s.backupOffsiteCmd ?? "");
    setSlaRestoreDrillAt(s.slaRestoreDrillAt ? s.slaRestoreDrillAt.slice(0, 10) : "");
    setSlaCapacityReviewAt(s.slaCapacityReviewAt ? s.slaCapacityReviewAt.slice(0, 10) : "");
    setSlaSecretRotationAt(s.slaSecretRotationAt ? s.slaSecretRotationAt.slice(0, 10) : "");
    setSlaIncidentRunbookAck(Boolean(s.slaIncidentRunbookAck));
    setSlaPentestAck(Boolean(s.slaPentestAck));
  }, []);

  const refreshReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const r = await api.getAdminReadiness();
      setReadiness(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminSettings.loadFailed"));
    } finally {
      setReadinessLoading(false);
    }
  }, [t]);

  const refresh = useCallback(async () => {
    const s = await api.getPanelSettings();
    applyView(s);
  }, [applyView]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("adminSettings.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  useEffect(() => {
    if (tab === "golive") {
      void refreshReadiness();
    }
  }, [tab, refreshReadiness]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Parameters<typeof api.updatePanelSettings>[0] = {
        appName,
        appLogo,
        appFavicon,
        publicHost,
        publicBaseUrl,
        registrationEnabled,
        defaultMaxServers,
        defaultMaxMemoryMb,
        defaultMaxDatabases,
        defaultBackupKeepCount,
        cloudflareDomain,
        cloudflareZoneId,
        mailFrom,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpStartTls,
        smtpUser,
        debugMode,
        unitPrefix,
        navigationType,
        displayWidth,
        activityWebhookUrl,
        alertEmail,
        activityAlertMute,
        backupOffsiteCmd,
        slaRestoreDrillAt: slaRestoreDrillAt || null,
        slaCapacityReviewAt: slaCapacityReviewAt || null,
        slaSecretRotationAt: slaSecretRotationAt || null,
        slaIncidentRunbookAck,
        slaPentestAck,
      };
      if (cloudflareApiToken.trim()) {
        body.cloudflareApiToken = cloudflareApiToken.trim();
      }
      if (smtpPass !== "") {
        body.smtpPass = smtpPass;
      }
      const res = await api.updatePanelSettings(body);
      applyView(res);
      window.dispatchEvent(new Event("guartrix:branding-changed"));
      if (tab === "golive") void refreshReadiness();
      if (res.restartRequired) {
        setRestartRequired(true);
        setNotice(t("adminSettings.savedRestart"));
      } else {
        setNotice(t("adminSettings.saved"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminSettings.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onTestMail() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.testPanelMail();
      setNotice(
        res.delivered
          ? t("adminSettings.testMailSent", { to: res.to })
          : t("adminSettings.testMailOutbox", { to: res.to }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminSettings.testMailFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onGoToTab(next: string) {
    if (next === "security") {
      navigate("/admin/security");
      return;
    }
    if (
      next === "general" ||
      next === "mail" ||
      next === "backup" ||
      next === "misc" ||
      next === "alerts" ||
      next === "golive"
    ) {
      setTab(next);
    }
  }

  return {
    t,
    tab,
    setTab,
    loading,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    restartRequired,
    appName,
    setAppName,
    appLogo,
    setAppLogo,
    appFavicon,
    setAppFavicon,
    publicHost,
    setPublicHost,
    publicBaseUrl,
    setPublicBaseUrl,
    registrationEnabled,
    setRegistrationEnabled,
    defaultMaxServers,
    setDefaultMaxServers,
    defaultMaxMemoryMb,
    setDefaultMaxMemoryMb,
    defaultMaxDatabases,
    setDefaultMaxDatabases,
    defaultBackupKeepCount,
    setDefaultBackupKeepCount,
    cloudflareDomain,
    setCloudflareDomain,
    cloudflareZoneId,
    setCloudflareZoneId,
    cloudflareApiToken,
    setCloudflareApiToken,
    cloudflareApiTokenSet,
    mailFrom,
    setMailFrom,
    smtpHost,
    setSmtpHost,
    smtpPort,
    setSmtpPort,
    smtpSecure,
    setSmtpSecure,
    smtpStartTls,
    setSmtpStartTls,
    smtpUser,
    setSmtpUser,
    smtpPass,
    setSmtpPass,
    smtpPassSet,
    smtpConfigured,
    debugMode,
    setDebugMode,
    unitPrefix,
    setUnitPrefix,
    navigationType,
    setNavigationType,
    displayWidth,
    setDisplayWidth,
    activityWebhookUrl,
    setActivityWebhookUrl,
    alertEmail,
    setAlertEmail,
    activityAlertMute,
    setActivityAlertMute,
    backupOffsiteCmd,
    setBackupOffsiteCmd,
    readiness,
    readinessLoading,
    slaRestoreDrillAt,
    setSlaRestoreDrillAt,
    slaCapacityReviewAt,
    setSlaCapacityReviewAt,
    slaSecretRotationAt,
    setSlaSecretRotationAt,
    slaIncidentRunbookAck,
    setSlaIncidentRunbookAck,
    slaPentestAck,
    setSlaPentestAck,
    refreshReadiness,
    onSave,
    onTestMail,
    onGoToTab,
  };
}

export type AdminSettingsState = ReturnType<typeof useAdminSettings>;
