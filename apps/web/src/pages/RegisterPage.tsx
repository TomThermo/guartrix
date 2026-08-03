import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthShell } from "../components/AuthShell";
import { useI18n } from "../i18n/react";

export function RegisterPage() {
  const { authenticated, refreshUser } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyFirst, setVerifyFirst] = useState(false);
  const [policy, setPolicy] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    void api
      .authConfig()
      .then((c) => {
        setEnabled(c.registrationEnabled);
        setPolicy(c.passwordPolicy);
      })
      .catch(() => setEnabled(false));
  }, []);

  if (authenticated) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("auth.passwordsMismatch"));
      return;
    }
    if (!acceptTerms) {
      setError(t("auth.mustAcceptTerms"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.register({
        username: username.trim(),
        email: email.trim(),
        password,
        acceptTerms: true,
      });
      if (res.emailVerificationRequired && !res.user) {
        setVerifyFirst(true);
        return;
      }
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registrationFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) {
    return (
      <AuthShell
        title={t("auth.registrationClosed")}
        subtitle={t("auth.registrationClosedSubtitle")}
      >
        <Alert variant="secondary" className="mb-0">
          {t("auth.registrationClosedBody")}{" "}
          <Link to="/login">{t("auth.signIn")}</Link>.
        </Alert>
      </AuthShell>
    );
  }

  if (verifyFirst) {
    return (
      <AuthShell
        title={t("auth.checkEmailTitle")}
        subtitle={t("auth.checkEmailSubtitle")}
      >
        <Alert variant="success" className="mb-3">
          {t("auth.checkEmailBody", { email: email.trim() })}{" "}
          <Link to="/login">{t("auth.signIn")}</Link>.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
    >
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      <Form onSubmit={onSubmit}>
        <Form.Group className="mb-3" controlId="reg-username">
          <Form.Label>{t("auth.username")}</Form.Label>
          <Form.Control
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_\-]+"
            autoFocus
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="reg-email">
          <Form.Label>{t("auth.email")}</Form.Label>
          <Form.Control
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="reg-password">
          <Form.Label>{t("auth.password")}</Form.Label>
          <Form.Control
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Form.Text className="text-secondary">
            {policy ?? t("auth.passwordPolicyDefault")}
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3" controlId="reg-confirm">
          <Form.Label>{t("auth.confirmPassword")}</Form.Label>
          <Form.Control
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={12}
          />
        </Form.Group>
        <Form.Check
          className="mb-3"
          type="checkbox"
          id="accept-terms"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          label={
            <span>
              {t("auth.agreeTermsPrefix")}{" "}
              <Link to="/terms">{t("auth.termsOfService")}</Link> {t("auth.and")}{" "}
              <Link to="/privacy">{t("auth.privacyPolicy")}</Link>
            </span>
          }
        />
        <Button type="submit" variant="primary" className="w-100" disabled={busy || enabled === null}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" /> {t("auth.creatingAccount")}
            </>
          ) : (
            <>
              <i className="fa-solid fa-user-plus me-2" />
              {t("auth.registerTitle")}
            </>
          )}
        </Button>
      </Form>
      <div className="mt-3 small">
        {t("auth.alreadyHaveAccount")}{" "}
        <Link to="/login">{t("auth.signIn")}</Link>
      </div>
    </AuthShell>
  );
}
