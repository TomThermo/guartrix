import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api, type PanelSettings } from "../api";
import { useAuth } from "../auth";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";
import { SecurityPanel } from "./admin-settings/SecurityPanel";

export function AdminSecurityPage() {
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);

  const [httpsEnabled, setHttpsEnabled] = useState(true);
  const [sessionSecure, setSessionSecure] = useState(true);
  const [trustProxy, setTrustProxy] = useState(true);
  const [trustedProxies, setTrustedProxies] = useState("");
  const [twoFactorRoles, setTwoFactorRoles] = useState<string[]>([]);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileSecretKey, setTurnstileSecretKey] = useState("");
  const [turnstileSecretKeySet, setTurnstileSecretKeySet] = useState(false);
  const [redisInfo, setRedisInfo] = useState<PanelSettings["redis"] | null>(null);

  const applyView = useCallback((s: PanelSettings) => {
    setHttpsEnabled(s.httpsEnabled);
    setSessionSecure(s.sessionSecure);
    setTrustProxy(Boolean(s.trustProxy));
    setTrustedProxies(s.trustedProxies ?? "");
    setTwoFactorRoles(s.twoFactorRequiredRoles ?? []);
    setTurnstileEnabled(Boolean(s.turnstileEnabled));
    setTurnstileSiteKey(s.turnstileSiteKey ?? "");
    setTurnstileSecretKey("");
    setTurnstileSecretKeySet(Boolean(s.turnstileSecretKeySet));
    setRedisInfo(s.redis ?? null);
    setRestartRequired(Boolean(s.restartRequired));
  }, []);

  const refresh = useCallback(() => api.getPanelSettings().then(applyView), [applyView]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("adminSettings.loadFailed")))
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
        httpsEnabled,
        sessionSecure,
        trustProxy,
        trustedProxies,
        twoFactorRequiredRoles: twoFactorRoles,
        turnstileEnabled,
        turnstileSiteKey,
      };
      if (turnstileSecretKey !== "") {
        body.turnstileSecretKey = turnstileSecretKey;
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
      setError(err instanceof Error ? err.message : t("adminSettings.saveFailed"));
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
      title={t("adminSecurity.title")}
      subtitle={t("adminSecurity.subtitle")}
      icon="fa-shield-halved"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      warning={
        restartRequired ? <Alert variant="warning">{t("adminSettings.restartBanner")}</Alert> : null
      }
      loading={loading}
      loadingLabel={t("common.loading")}
    >
      <Form onSubmit={onSave} className="admin-settings">
        <div className="admin-settings-content">
          <AdminPanelCard>
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
              turnstileEnabled={turnstileEnabled}
              onTurnstileEnabledChange={setTurnstileEnabled}
              turnstileSiteKey={turnstileSiteKey}
              onTurnstileSiteKeyChange={setTurnstileSiteKey}
              turnstileSecretKey={turnstileSecretKey}
              onTurnstileSecretKeyChange={setTurnstileSecretKey}
              turnstileSecretKeySet={turnstileSecretKeySet}
            />
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
