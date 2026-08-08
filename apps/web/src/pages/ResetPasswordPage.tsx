import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { AuthShell } from "../components/AuthShell";
import { useI18n } from "../i18n/react";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError(t("auth.missingResetToken"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsMismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword(token, password);
      setNotice(res.message);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("auth.resetTitle")} subtitle={t("auth.resetSubtitle")}>
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="py-2">
          {notice} <Link to="/login">{t("auth.signIn")}</Link>
        </Alert>
      )}
      {!notice && (
        <Form onSubmit={onSubmit}>
          {!token && (
            <Alert variant="warning" className="py-2">
              {t("auth.tokenRequiredAlert")}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="reset-password">
            <Form.Label>{t("auth.newPassword")}</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={12}
              autoFocus
            />
            <Form.Text className="text-secondary">{t("auth.passwordHint")}</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3" controlId="reset-confirm">
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
          <Button type="submit" variant="primary" className="w-100" disabled={busy || !token}>
            {busy ? (
              <>
                <Spinner size="sm" className="me-2" /> {t("common.updating")}
              </>
            ) : (
              t("auth.updatePassword")
            )}
          </Button>
        </Form>
      )}
      <div className="mt-3 small">
        <Link to="/login">{t("auth.backToSignInShort")}</Link>
      </div>
    </AuthShell>
  );
}
