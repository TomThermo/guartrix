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
  Tab,
} from "react-bootstrap";
import { api, type PanelSettings } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";

type SettingsTab = "general" | "mail" | "security" | "alerts";

const ROLE_OPTIONS = ["ADMIN", "OPERATOR", "VIEWER"] as const;

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
    <div className="page-narrow">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">{t("adminSettings.title")}</h1>
          <p className="text-secondary mb-0 small">
            {t("adminSettings.subtitle")}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {restartRequired && (
        <Alert variant="warning">{t("adminSettings.restartBanner")}</Alert>
      )}

      {loading ? (
        <div className="text-center py-5 text-secondary">
          <Spinner size="sm" className="me-2" />
          {t("common.loading")}
        </div>
      ) : (
        <Form onSubmit={onSave}>
          <Tab.Container
            activeKey={tab}
            onSelect={(k) => k && setTab(k as SettingsTab)}
          >
            <Nav variant="tabs" className="mb-3 flex-wrap">
              <Nav.Item>
                <Nav.Link eventKey="general">
                  {t("adminSettings.tabGeneral")}
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="mail">{t("adminSettings.tabMail")}</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="security">
                  {t("adminSettings.tabSecurity")}
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="alerts">
                  {t("adminSettings.tabAlerts")}
                </Nav.Link>
              </Nav.Item>
            </Nav>

            <Tab.Content>
              <Tab.Pane eventKey="general">
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.publicHost")}</Form.Label>
                      <Form.Control
                        value={publicHost}
                        onChange={(e) => setPublicHost(e.target.value)}
                        required
                      />
                      <Form.Text muted>
                        {t("adminSettings.publicHostHelp")}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.publicBaseUrl")}</Form.Label>
                      <Form.Control
                        value={publicBaseUrl}
                        onChange={(e) => setPublicBaseUrl(e.target.value)}
                        required
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12}>
                    <Form.Check
                      type="switch"
                      id="registration-enabled"
                      label={t("adminSettings.registrationEnabled")}
                      checked={registrationEnabled}
                      onChange={(e) => setRegistrationEnabled(e.target.checked)}
                    />
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>
                        {t("adminSettings.defaultMaxServers")}
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={defaultMaxServers}
                        onChange={(e) =>
                          setDefaultMaxServers(Number(e.target.value) || 0)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>
                        {t("adminSettings.defaultMaxMemoryMb")}
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={defaultMaxMemoryMb}
                        onChange={(e) =>
                          setDefaultMaxMemoryMb(Number(e.target.value) || 0)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>
                        {t("adminSettings.defaultMaxDatabases")}
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={defaultMaxDatabases}
                        onChange={(e) =>
                          setDefaultMaxDatabases(Number(e.target.value) || 0)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12}>
                    <h2 className="h6 mt-2 mb-2">
                      {t("adminSettings.cloudflareHeading")}
                    </h2>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.cfDomain")}</Form.Label>
                      <Form.Control
                        value={cloudflareDomain}
                        onChange={(e) => setCloudflareDomain(e.target.value)}
                        placeholder="example.com"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.cfZoneId")}</Form.Label>
                      <Form.Control
                        value={cloudflareZoneId}
                        onChange={(e) => setCloudflareZoneId(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.cfApiToken")}</Form.Label>
                      <Form.Control
                        type="password"
                        autoComplete="new-password"
                        value={cloudflareApiToken}
                        onChange={(e) => setCloudflareApiToken(e.target.value)}
                        placeholder={
                          cloudflareApiTokenSet
                            ? t("adminSettings.secretSet")
                            : t("adminSettings.secretEmpty")
                        }
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="mail">
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.mailFrom")}</Form.Label>
                      <Form.Control
                        value={mailFrom}
                        onChange={(e) => setMailFrom(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.smtpHost")}</Form.Label>
                      <Form.Control
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.smtpPort")}</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        max={65535}
                        value={smtpPort}
                        onChange={(e) =>
                          setSmtpPort(Number(e.target.value) || 465)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4} className="d-flex align-items-end">
                    <Form.Check
                      type="switch"
                      id="smtp-secure"
                      label={t("adminSettings.smtpSecure")}
                      checked={smtpSecure}
                      onChange={(e) => setSmtpSecure(e.target.checked)}
                    />
                  </Col>
                  <Col md={4} className="d-flex align-items-end">
                    <Form.Check
                      type="switch"
                      id="smtp-starttls"
                      label={t("adminSettings.smtpStartTls")}
                      checked={smtpStartTls}
                      onChange={(e) => setSmtpStartTls(e.target.checked)}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.smtpUser")}</Form.Label>
                      <Form.Control
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        autoComplete="off"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.smtpPass")}</Form.Label>
                      <Form.Control
                        type="password"
                        autoComplete="new-password"
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        placeholder={
                          smtpPassSet
                            ? t("adminSettings.secretSet")
                            : t("adminSettings.secretEmpty")
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12}>
                    <Button
                      type="button"
                      variant="outline-secondary"
                      disabled={busy || !smtpConfigured}
                      onClick={() => void onTestMail()}
                    >
                      {t("adminSettings.testMail")}
                    </Button>
                    {!smtpConfigured && (
                      <span className="small text-secondary ms-2">
                        {t("adminSettings.smtpRequired")}
                      </span>
                    )}
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="security">
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Check
                      type="switch"
                      id="https-enabled"
                      label={t("adminSettings.httpsEnabled")}
                      checked={httpsEnabled}
                      onChange={(e) => setHttpsEnabled(e.target.checked)}
                    />
                    <Form.Text muted className="d-block">
                      {t("adminSettings.httpsHelp")}
                    </Form.Text>
                  </Col>
                  <Col xs={12}>
                    <Form.Check
                      type="switch"
                      id="session-secure"
                      label={t("adminSettings.sessionSecure")}
                      checked={sessionSecure}
                      onChange={(e) => setSessionSecure(e.target.checked)}
                    />
                  </Col>
                  <Col xs={12}>
                    <div className="border rounded p-3 bg-body-tertiary">
                      <div className="fw-semibold mb-1">Redis (multi-API HA)</div>
                      <p className="small text-secondary mb-2">
                        Configure via installer or <code>.env</code> (
                        <code>REDIS_URL</code>, <code>SESSION_STORE</code>,{" "}
                        <code>RATE_LIMIT_STORE</code>). Restart required after
                        env changes.
                      </p>
                      {redisInfo ? (
                        <dl className="row small mb-2">
                          <dt className="col-sm-3 text-secondary">Status</dt>
                          <dd className="col-sm-9">
                            {!redisInfo.configured
                              ? "Not configured"
                              : redisInfo.connected
                                ? "Connected"
                                : redisInfo.error || "Disconnected"}
                          </dd>
                          <dt className="col-sm-3 text-secondary">URL</dt>
                          <dd className="col-sm-9 font-monospace text-break">
                            {redisInfo.urlMasked ?? "—"}
                          </dd>
                          <dt className="col-sm-3 text-secondary">Sessions</dt>
                          <dd className="col-sm-9">{redisInfo.sessionStore}</dd>
                          <dt className="col-sm-3 text-secondary">Rate limits</dt>
                          <dd className="col-sm-9">{redisInfo.rateLimitStore}</dd>
                          <dt className="col-sm-3 text-secondary">Latency</dt>
                          <dd className="col-sm-9">
                            {redisInfo.latencyMs != null
                              ? `${redisInfo.latencyMs} ms`
                              : "—"}
                          </dd>
                        </dl>
                      ) : (
                        <p className="small text-secondary">Loading…</p>
                      )}
                      <Button
                        type="button"
                        variant="outline-secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onTestRedis()}
                      >
                        Test Redis connection
                      </Button>
                    </div>
                  </Col>
                  <Col xs={12}>
                    <Form.Label className="fw-semibold">
                      {t("adminSettings.twoFactorRoles")}
                    </Form.Label>
                    <div className="d-flex flex-wrap gap-3">
                      {ROLE_OPTIONS.map((role) => (
                        <Form.Check
                          key={role}
                          type="checkbox"
                          id={`2fa-${role}`}
                          label={role}
                          checked={twoFactorRoles.includes(role)}
                          onChange={() => toggleRole(role)}
                        />
                      ))}
                    </div>
                    <Form.Text muted>
                      {t("adminSettings.twoFactorRolesHelp")}
                    </Form.Text>
                  </Col>
                </Row>
              </Tab.Pane>

              <Tab.Pane eventKey="alerts">
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>
                        {t("adminSettings.activityWebhookUrl")}
                      </Form.Label>
                      <Form.Control
                        value={activityWebhookUrl}
                        onChange={(e) => setActivityWebhookUrl(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/…"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>{t("adminSettings.alertEmail")}</Form.Label>
                      <Form.Control
                        type="email"
                        value={alertEmail}
                        onChange={(e) => setAlertEmail(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12}>
                    <Form.Group>
                      <Form.Label>
                        {t("adminSettings.activityAlertMute")}
                      </Form.Label>
                      <Form.Control
                        value={activityAlertMute}
                        onChange={(e) => setActivityAlertMute(e.target.value)}
                        placeholder="auth.login-failed, …"
                      />
                      <Form.Text muted>
                        {t("adminSettings.activityAlertMuteHelp")}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>

          <div className="mt-4 d-flex gap-2">
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
        </Form>
      )}
    </div>
  );
}
