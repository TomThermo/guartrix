import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Spinner } from "react-bootstrap";
import { api } from "../api";
import { AuthShell } from "../components/AuthShell";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() || "", [params]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing verification token.");
      return;
    }
    setBusy(true);
    void api
      .verifyEmail(token)
      .then((r) => setNotice(r.message))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Verification failed"),
      )
      .finally(() => setBusy(false));
  }, [token]);

  return (
    <AuthShell title="Verify email" subtitle="Confirm your Guartrix account">
      {busy && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" className="me-2" /> Verifying…
        </div>
      )}
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="py-2">
          {notice}{" "}
          <Link to="/login">Sign in</Link>
        </Alert>
      )}
      {!busy && !notice && !error && (
        <Button variant="primary" disabled>
          Waiting…
        </Button>
      )}
      <div className="mt-3 small">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
