import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Spinner } from "react-bootstrap";
import { api } from "../api";
import { AuthShell } from "../components/AuthShell";
import { useI18n } from "../i18n/react";

export function VerifyEmailPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t("auth.missingVerifyToken"));
      return;
    }
    setBusy(true);
    void api
      .verifyEmail(token)
      .then((r) => setNotice(r.message))
      .catch((err) => setError(err instanceof Error ? err.message : t("auth.verificationFailed")))
      .finally(() => setBusy(false));
  }, [token, t]);

  return (
    <AuthShell title={t("auth.verifyEmailTitle")} subtitle={t("auth.verifyEmailSubtitle")}>
      {busy && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" className="me-2" /> {t("common.verifying")}
        </div>
      )}
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
      {!busy && !notice && !error && (
        <Button variant="primary" disabled>
          {t("common.waiting")}
        </Button>
      )}
      <div className="mt-3 small">
        <Link to="/login">{t("auth.backToSignInShort")}</Link>
      </div>
    </AuthShell>
  );
}
