import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthShell } from "../components/AuthShell";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { useI18n } from "../i18n/react";

const REMEMBER_KEY = "guartrix.rememberMe";
const USERNAME_KEY = "guartrix.lastUsername";
const LEGACY_REMEMBER_KEY = "blockhost.rememberMe";
const LEGACY_USERNAME_KEY = "blockhost.lastUsername";

function readMigrated(key: string, legacyKey: string): string | null {
  const current = localStorage.getItem(key);
  if (current != null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy != null) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
    return legacy;
  }
  return null;
}

export function LoginPage() {
  const { login, loginTwoFactor, authenticated, pendingTwoFactor } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState(
    () => readMigrated(USERNAME_KEY, LEGACY_USERNAME_KEY) || "",
  );
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [rememberMe, setRememberMe] = useState(
    () => readMigrated(REMEMBER_KEY, LEGACY_REMEMBER_KEY) === "1",
  );
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);

  useEffect(() => {
    void api
      .authConfig()
      .then((c) => {
        setRegistrationEnabled(c.registrationEnabled);
        setTurnstileEnabled(Boolean(c.turnstileEnabled && c.turnstileSiteKey));
        setTurnstileSiteKey(c.turnstileSiteKey ?? null);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (pendingTwoFactor) setNeedsTwoFactor(true);
  }, [pendingTwoFactor]);

  if (authenticated) return <Navigate to="/" replace />;

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (turnstileEnabled && !turnstileToken.trim()) {
      setError(t("auth.turnstileRequired"));
      setBusy(false);
      return;
    }
    try {
      const result = await login(
        username,
        password,
        rememberMe,
        turnstileToken || undefined,
      );
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, "1");
        localStorage.setItem(USERNAME_KEY, username.trim());
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(USERNAME_KEY);
      }
      if (result.requiresTwoFactor) {
        setNeedsTwoFactor(true);
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
      setTurnstileToken("");
      setTurnstileReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginTwoFactor(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  if (needsTwoFactor) {
    return (
      <AuthShell
        title={t("auth.twoFactorTitle")}
        subtitle={t("auth.twoFactorSubtitle")}
      >
        {error && (
          <Alert variant="danger" className="py-2">
            {error}
          </Alert>
        )}
        <Form onSubmit={onSubmitCode}>
          <Form.Group className="mb-3" controlId="totp-code">
            <Form.Label>{t("auth.authCode")}</Form.Label>
            <Form.Control
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              required
              autoFocus
            />
            <Form.Text className="text-secondary">
              {t("auth.recoveryHint")}
            </Form.Text>
          </Form.Group>
          <Button type="submit" variant="primary" className="w-100" disabled={busy}>
            {busy ? (
              <>
                <Spinner size="sm" className="me-2" /> {t("auth.verifying")}
              </>
            ) : (
              <>
                <i className="fa-solid fa-shield-halved me-2" />
                {t("auth.verify")}
              </>
            )}
          </Button>
        </Form>
        <div className="mt-3 small">
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() => {
              setNeedsTwoFactor(false);
              setCode("");
              setError(null);
            }}
          >
            {t("auth.backToSignIn")}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.signInTitle")} subtitle={t("auth.signInSubtitle")}>
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      <Form onSubmit={onSubmitPassword}>
        <Form.Group className="mb-3" controlId="username">
          <Form.Label>{t("auth.username")}</Form.Label>
          <Form.Control
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="password">
          <Form.Label>{t("auth.password")}</Form.Label>
          <Form.Control
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Form.Group>
        <Form.Check
          className="mb-3"
          type="checkbox"
          id="remember-me"
          label={t("auth.rememberMe")}
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        {turnstileEnabled && turnstileSiteKey && (
          <TurnstileWidget
            key={turnstileReset}
            siteKey={turnstileSiteKey}
            onToken={setTurnstileToken}
          />
        )}
        <Button type="submit" variant="primary" className="w-100" disabled={busy}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" /> {t("auth.signingIn")}
            </>
          ) : (
            <>
              <i className="fa-solid fa-right-to-bracket me-2" />
              {t("auth.signIn")}
            </>
          )}
        </Button>
      </Form>
      <div className="d-flex justify-content-between flex-wrap gap-2 mt-3 small">
        <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
        {registrationEnabled && (
          <Link to="/register">{t("auth.createAccount")}</Link>
        )}
      </div>
    </AuthShell>
  );
}
