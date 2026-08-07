import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  Alert,
  Button,
  Form,
  Nav,
  Spinner,
} from "react-bootstrap";
import { api, type PanelSettings } from "../api";
import { useAuth } from "../auth";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";
import { AlertsPanel } from "./admin-settings/AlertsPanel";
import { BackupSettingsPanel } from "./admin-settings/BackupSettingsPanel";
import { GeneralPanel } from "./admin-settings/GeneralPanel";
import { GoLivePanel } from "./admin-settings/GoLivePanel";
import { MailPanel } from "./admin-settings/MailPanel";
import { MiscPanel } from "./admin-settings/MiscPanel";
import { SecurityPanel } from "./admin-settings/SecurityPanel";
import type { ReadinessReport } from "../api/admin-settings";

type SettingsTab =
  | "general"
  | "mail"
  | "backup"
  | "security"
  | "misc"
  | "alerts"
  | "golive";

const SETTINGS_TABS: Array<{ id: SettingsTab; icon: string; labelKey: string }> = [
  { id: "general", icon: "fa-sliders", labelKey: "adminSettings.tabGeneral" },
  { id: "mail", icon: "fa-paper-plane", labelKey: "adminSettings.tabMail" },
  { id: "backup", icon: "fa-box-archive", labelKey: "adminSettings.tabBackup" },
  { id: "security", icon: "fa-shield-halved", labelKey: "adminSettings.tabSecurity" },
  { id: "misc", icon: "fa-ellipsis", labelKey: "adminSettings.tabMisc" },
  { id: "alerts", icon: "fa-bell", labelKey: "adminSettings.tabAlerts" },
  { id: "golive", icon: "fa-rocket", labelKey: "adminSettings.tabGoLive" },
];

export function AdminSettingsPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>("general");
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

  const [httpsEnabled, setHttpsEnabled] = useState(true);
  const [sessionSecure, setSessionSecure] = useState(true);
  const [trustProxy, setTrustProxy] = useState(true);
  const [trustedProxies, setTrustedProxies] = useState("");
  const [twoFactorRoles, setTwoFactorRoles] = useState<string[]>([]);

  const [debugMode, setDebugMode] = useState(false);
  const [unitPrefix, setUnitPrefix] = useState<"binary" | "decimal">("binary");
  const [navigationType, setNavigationType] = useState<
    "sidebar" | "topbar" | "mixed"
  >("mixed");
  const [displayWidth, setDisplayWidth] = useState<"xl" | "2xl" | "full">("xl");

  const [activityWebhookUrl, setActivityWebhookUrl] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [activityAlertMute, setActivityAlertMute] = useState("");
  const [backupOffsiteCmd, setBackupOffsiteCmd] = useState("");
  const [redisInfo, setRedisInfo] = useState<PanelSettings["redis"] | null>(
    null,
  );
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
    setHttpsEnabled(s.httpsEnabled);
    setSessionSecure(s.sessionSecure);
    setTrustProxy(Boolean(s.trustProxy));
    setTrustedProxies(s.trustedProxies || "");
    setTwoFactorRoles(s.twoFactorRequiredRoles ?? []);
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
    setRedisInfo(s.redis ?? null);
    setSlaRestoreDrillAt(
      s.slaRestoreDrillAt ? s.slaRestoreDrillAt.slice(0, 10) : "",
    );
    setSlaCapacityReviewAt(
      s.slaCapacityReviewAt ? s.slaCapacityReviewAt.slice(0, 10) : "",
    );
    setSlaSecretRotationAt(
      s.slaSecretRotationAt ? s.slaSecretRotationAt.slice(0, 10) : "",
    );
    setSlaIncidentRunbookAck(Boolean(s.slaIncidentRunbookAck));
    setSlaPentestAck(Boolean(s.slaPentestAck));
  }, []);

  const refreshReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const r = await api.getAdminReadiness();
      setReadiness(r);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("adminSettings.loadFailed"),
      );
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
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : t("adminSettings.loadFailed"),
        ),
      )
      .finally(() => setLoading(false));
  }, [refresh, t]);

  useEffect(() => {
    if (tab === "golive") {
      void refreshReadiness();
    }
  }, [tab, refreshReadiness]);

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

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
        httpsEnabled,
        sessionSecure,
        trustProxy,
        trustedProxies,
        debugMode,
        unitPrefix,
        navigationType,
        displayWidth,
        twoFactorRequiredRoles: twoFactorRoles,
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
      setError(
        err instanceof Error ? err.message : t("adminSettings.saveFailed"),
      );
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
      setError(
        err instanceof Error ? err.message : t("adminSettings.testMailFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onTestRedis() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.testPanelRedis();
      setRedisInfo({
        configured: res.configured,
        enabled: res.enabled,
        connected: res.connected,
        urlMasked: res.urlMasked,
        latencyMs: res.latencyMs,
        error: res.error,
        sessionStore: res.sessionStore,
        rateLimitStore: res.rateLimitStore,
      });
      setNotice(
        res.connected
          ? `Redis OK${res.latencyMs != null ? ` (${res.latencyMs} ms)` : ""}`
          : "Redis ping failed",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redis test failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(role: string) {
    setTwoFactorRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  return (
    <AdminPageShell
      title={t("adminSettings.title")}
      subtitle={t("adminSettings.subtitle")}
      icon="fa-gears"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      warning={
        restartRequired ? (
          <Alert variant="warning">{t("adminSettings.restartBanner")}</Alert>
        ) : null
      }
      loading={loading}
      loadingLabel={t("common.loading")}
    >
      <Form onSubmit={onSave} className="admin-settings">
        <Nav
          variant="pills"
          className="admin-settings__tabs gap-1 mb-3 flex-wrap"
          activeKey={tab}
          onSelect={(k) => k && setTab(k as SettingsTab)}
        >
          {SETTINGS_TABS.map((item) => (
            <Nav.Item key={item.id}>
              <Nav.Link eventKey={item.id}>
                <i className={`fa-solid ${item.icon} me-1`} aria-hidden />
                {t(item.labelKey)}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>

        <div className="admin-settings-content">
          <AdminPanelCard>
            {tab === "general" && (
              <GeneralPanel
                  appName={appName}
                  onAppNameChange={setAppName}
                  appLogo={appLogo}
                  onAppLogoChange={setAppLogo}
                  appFavicon={appFavicon}
                  onAppFaviconChange={setAppFavicon}
                  publicHost={publicHost}
                  onPublicHostChange={setPublicHost}
                  publicBaseUrl={publicBaseUrl}
                  onPublicBaseUrlChange={setPublicBaseUrl}
                  registrationEnabled={registrationEnabled}
                  onRegistrationEnabledChange={setRegistrationEnabled}
                  defaultMaxServers={defaultMaxServers}
                  onDefaultMaxServersChange={setDefaultMaxServers}
                  defaultMaxMemoryMb={defaultMaxMemoryMb}
                  onDefaultMaxMemoryMbChange={setDefaultMaxMemoryMb}
                  defaultMaxDatabases={defaultMaxDatabases}
                  onDefaultMaxDatabasesChange={setDefaultMaxDatabases}
                  cloudflareDomain={cloudflareDomain}
                  onCloudflareDomainChange={setCloudflareDomain}
                  cloudflareZoneId={cloudflareZoneId}
                  onCloudflareZoneIdChange={setCloudflareZoneId}
                  cloudflareApiToken={cloudflareApiToken}
                  onCloudflareApiTokenChange={setCloudflareApiToken}
                  cloudflareApiTokenSet={cloudflareApiTokenSet}
                />
              )}

              {tab === "mail" && (
                <MailPanel
                  mailFrom={mailFrom}
                  onMailFromChange={setMailFrom}
                  smtpHost={smtpHost}
                  onSmtpHostChange={setSmtpHost}
                  smtpPort={smtpPort}
                  onSmtpPortChange={setSmtpPort}
                  smtpSecure={smtpSecure}
                  onSmtpSecureChange={setSmtpSecure}
                  smtpStartTls={smtpStartTls}
                  onSmtpStartTlsChange={setSmtpStartTls}
                  smtpUser={smtpUser}
                  onSmtpUserChange={setSmtpUser}
                  smtpPass={smtpPass}
                  onSmtpPassChange={setSmtpPass}
                  smtpPassSet={smtpPassSet}
                  smtpConfigured={smtpConfigured}
                  busy={busy}
                  onTestMail={() => void onTestMail()}
                />
              )}

              {tab === "backup" && (
                <BackupSettingsPanel
                  defaultBackupKeepCount={defaultBackupKeepCount}
                  onDefaultBackupKeepCountChange={setDefaultBackupKeepCount}
                  backupOffsiteCmd={backupOffsiteCmd}
                  onBackupOffsiteCmdChange={setBackupOffsiteCmd}
                />
              )}

              {tab === "security" && (
                <SecurityPanel
                  httpsEnabled={httpsEnabled}
                  onHttpsEnabledChange={setHttpsEnabled}
                  sessionSecure={sessionSecure}
                  onSessionSecureChange={setSessionSecure}
                  trustProxy={trustProxy}
                  onTrustProxyChange={setTrustProxy}
                  trustedProxies={trustedProxies}
                  onTrustedProxiesChange={setTrustedProxies}
                  redisInfo={redisInfo}
                  busy={busy}
                  onTestRedis={() => void onTestRedis()}
                  twoFactorRoles={twoFactorRoles}
                  onToggleRole={toggleRole}
                />
              )}

              {tab === "misc" && (
                <MiscPanel
                  debugMode={debugMode}
                  onDebugModeChange={setDebugMode}
                  unitPrefix={unitPrefix}
                  onUnitPrefixChange={setUnitPrefix}
                  navigationType={navigationType}
                  onNavigationTypeChange={setNavigationType}
                  displayWidth={displayWidth}
                  onDisplayWidthChange={setDisplayWidth}
                />
              )}

              {tab === "alerts" && (
                <AlertsPanel
                  activityWebhookUrl={activityWebhookUrl}
                  onActivityWebhookUrlChange={setActivityWebhookUrl}
                  alertEmail={alertEmail}
                  onAlertEmailChange={setAlertEmail}
                  activityAlertMute={activityAlertMute}
                  onActivityAlertMuteChange={setActivityAlertMute}
                />
              )}

              {tab === "golive" && (
                <GoLivePanel
                  readiness={readiness}
                  loading={readinessLoading}
                  busy={busy}
                  onRefresh={() => void refreshReadiness()}
                  slaRestoreDrillAt={slaRestoreDrillAt}
                  onSlaRestoreDrillAtChange={setSlaRestoreDrillAt}
                  slaCapacityReviewAt={slaCapacityReviewAt}
                  onSlaCapacityReviewAtChange={setSlaCapacityReviewAt}
                  slaSecretRotationAt={slaSecretRotationAt}
                  onSlaSecretRotationAtChange={setSlaSecretRotationAt}
                  slaIncidentRunbookAck={slaIncidentRunbookAck}
                  onSlaIncidentRunbookAckChange={setSlaIncidentRunbookAck}
                  slaPentestAck={slaPentestAck}
                  onSlaPentestAckChange={setSlaPentestAck}
                  onGoToTab={(next) => {
                    if (
                      next === "general" ||
                      next === "mail" ||
                      next === "backup" ||
                      next === "security" ||
                      next === "misc" ||
                      next === "alerts" ||
                      next === "golive"
                    ) {
                      setTab(next);
                    }
                  }}
                />
              )}

              <div className="admin-form-actions">
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      {t("common.saving")}
                    </>
                  ) : (
                    t("common.save")
                  )}
                </Button>
              </div>
            </AdminPanelCard>
          </div>
      </Form>
    </AdminPageShell>
  );
}
