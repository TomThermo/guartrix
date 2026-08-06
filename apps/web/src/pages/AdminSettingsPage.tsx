import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  Alert,
  Button,
  Col,
  Form,
  Nav,
  Row,
  Spinner,
} from "react-bootstrap";
import { api, type PanelSettings } from "../api";
import { useAuth } from "../auth";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";
import { AlertsPanel } from "./admin-settings/AlertsPanel";
import { GeneralPanel } from "./admin-settings/GeneralPanel";
import { MailPanel } from "./admin-settings/MailPanel";
import { SecurityPanel } from "./admin-settings/SecurityPanel";

type SettingsTab = "general" | "mail" | "security" | "alerts";

const SETTINGS_TABS: Array<{ id: SettingsTab; icon: string; labelKey: string }> = [
  { id: "general", icon: "fa-sliders", labelKey: "adminSettings.tabGeneral" },
  { id: "mail", icon: "fa-paper-plane", labelKey: "adminSettings.tabMail" },
  { id: "security", icon: "fa-shield-halved", labelKey: "adminSettings.tabSecurity" },
  { id: "alerts", icon: "fa-bell", labelKey: "adminSettings.tabAlerts" },
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

  const [publicHost, setPublicHost] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [defaultMaxServers, setDefaultMaxServers] = useState(0);
  const [defaultMaxMemoryMb, setDefaultMaxMemoryMb] = useState(0);
  const [defaultMaxDatabases, setDefaultMaxDatabases] = useState(0);
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
  const [twoFactorRoles, setTwoFactorRoles] = useState<string[]>([]);

  const [activityWebhookUrl, setActivityWebhookUrl] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [activityAlertMute, setActivityAlertMute] = useState("");
  const [backupOffsiteCmd, setBackupOffsiteCmd] = useState("");
  const [redisInfo, setRedisInfo] = useState<PanelSettings["redis"] | null>(
    null,
  );

  const applyView = useCallback((s: PanelSettings) => {
    setPublicHost(s.publicHost);
    setPublicBaseUrl(s.publicBaseUrl);
    setRegistrationEnabled(s.registrationEnabled);
    setDefaultMaxServers(s.defaultMaxServers);
    setDefaultMaxMemoryMb(s.defaultMaxMemoryMb);
    setDefaultMaxDatabases(s.defaultMaxDatabases);
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
    setTwoFactorRoles(s.twoFactorRequiredRoles ?? []);
    setActivityWebhookUrl(s.activityWebhookUrl);
    setAlertEmail(s.alertEmail);
    setActivityAlertMute((s.activityAlertMute ?? []).join(", "));
    setBackupOffsiteCmd(s.backupOffsiteCmd ?? "");
    setRedisInfo(s.redis ?? null);
  }, []);

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

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Parameters<typeof api.updatePanelSettings>[0] = {
        publicHost,
        publicBaseUrl,
        registrationEnabled,
        defaultMaxServers,
        defaultMaxMemoryMb,
        defaultMaxDatabases,
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
        twoFactorRequiredRoles: twoFactorRoles,
        activityWebhookUrl,
        alertEmail,
        activityAlertMute,
        backupOffsiteCmd,
      };
      if (cloudflareApiToken.trim()) {
        body.cloudflareApiToken = cloudflareApiToken.trim();
      }
      if (smtpPass !== "") {
        body.smtpPass = smtpPass;
      }
      const res = await api.updatePanelSettings(body);
      applyView(res);
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
      <Form onSubmit={onSave}>
        <Row className="g-4 admin-settings-layout">
          <Col xs={12} md={4} lg={3}>
            <div className="settings-nav-wrap admin-nav-wrap">
              <Nav
                variant="pills"
                className="settings-nav admin-nav gap-1"
                activeKey={tab}
                onSelect={(k) => k && setTab(k as SettingsTab)}
              >
                {SETTINGS_TABS.map((item) => (
                  <Nav.Item key={item.id}>
                    <Nav.Link eventKey={item.id}>
                      <i className={`fa-solid ${item.icon}`} aria-hidden />
                      {t(item.labelKey)}
                    </Nav.Link>
                  </Nav.Item>
                ))}
              </Nav>
            </div>
          </Col>
          <Col xs={12} md={8} lg={9} className="admin-settings-content">
            <AdminPanelCard>
              {tab === "general" && (
                <GeneralPanel
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
                  backupOffsiteCmd={backupOffsiteCmd}
                  onBackupOffsiteCmdChange={setBackupOffsiteCmd}
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

              {tab === "security" && (
                <SecurityPanel
                  httpsEnabled={httpsEnabled}
                  onHttpsEnabledChange={setHttpsEnabled}
                  sessionSecure={sessionSecure}
                  onSessionSecureChange={setSessionSecure}
                  redisInfo={redisInfo}
                  busy={busy}
                  onTestRedis={() => void onTestRedis()}
                  twoFactorRoles={twoFactorRoles}
                  onToggleRole={toggleRole}
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
                  backupOffsiteCmd={backupOffsiteCmd}
                  onBackupOffsiteCmdChange={setBackupOffsiteCmd}
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
          </Col>
        </Row>
      </Form>
    </AdminPageShell>
  );
}
