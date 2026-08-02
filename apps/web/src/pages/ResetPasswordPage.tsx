import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { AuthShell } from "../components/AuthShell";

export function ResetPasswordPage() {
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
      setError("Missing reset token. Use the link from your email.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await api.resetPassword(token, password);
      setNotice(res.message);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Set new password" subtitle="Choose a strong password">
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="py-2">
          {notice} <Link to="/login">Sign in</Link>
        </Alert>
      )}
      {!notice && (
        <Form onSubmit={onSubmit}>
          {!token && (
            <Alert variant="warning" className="py-2">
              This page needs a valid token from your reset email.
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="reset-password">
            <Form.Label>New password</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={12}
              autoFocus
            />
            <Form.Text className="text-secondary">
              At least 12 characters with upper, lower, number, and symbol.
            </Form.Text>
          </Form.Group>
          <Form.Group className="mb-3" controlId="reset-confirm">
            <Form.Label>Confirm password</Form.Label>
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
                <Spinner size="sm" className="me-2" /> Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </Form>
      )}
      <div className="mt-3 small">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
