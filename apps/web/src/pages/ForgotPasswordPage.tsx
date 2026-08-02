import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { AuthShell } from "../components/AuthShell";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.forgotPassword(email.trim());
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Forgot password" subtitle="We'll email a reset link">
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="py-2">
          {notice}
        </Alert>
      )}
      <Form onSubmit={onSubmit}>
        <Form.Group className="mb-3" controlId="forgot-email">
          <Form.Label>Email</Form.Label>
          <Form.Control
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
        </Form.Group>
        <Button type="submit" variant="primary" className="w-100" disabled={busy}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" /> Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </Form>
      <div className="mt-3 small">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
