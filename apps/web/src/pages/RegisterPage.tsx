import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthShell } from "../components/AuthShell";

export function RegisterPage() {
  const { authenticated, refreshUser } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyFirst, setVerifyFirst] = useState(false);
  const [policy, setPolicy] = useState(
    "Password must be 12–128 characters and include uppercase, lowercase, a number, and a symbol.",
  );
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
      setError("Passwords do not match");
      return;
    }
    if (!acceptTerms) {
      setError("You must accept the Terms of Service");
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
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) {
    return (
      <AuthShell title="Registration closed" subtitle="New accounts are disabled">
        <Alert variant="secondary" className="mb-0">
          Self-serve registration is currently off. Ask an admin for an invite, or{" "}
          <Link to="/login">sign in</Link>.
        </Alert>
      </AuthShell>
    );
  }

  if (verifyFirst) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="Confirm your address before signing in"
      >
        <Alert variant="success" className="mb-3">
          We sent a verification link to <strong>{email.trim()}</strong>. Open it,
          then <Link to="/login">sign in</Link>.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Sign up now — buy a server plan when you're ready"
    >
      {error && (
        <Alert variant="danger" className="py-2">
          {error}
        </Alert>
      )}
      <Form onSubmit={onSubmit}>
        <Form.Group className="mb-3" controlId="reg-username">
          <Form.Label>Username</Form.Label>
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
          <Form.Label>Email</Form.Label>
          <Form.Control
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId="reg-password">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={12}
          />
          <Form.Text className="text-secondary">{policy}</Form.Text>
        </Form.Group>
        <Form.Group className="mb-3" controlId="reg-confirm">
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
        <Form.Check
          className="mb-3"
          type="checkbox"
          id="accept-terms"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          label={
            <span>
              I agree to the <Link to="/terms">Terms of Service</Link> and{" "}
              <Link to="/privacy">Privacy Policy</Link>
            </span>
          }
        />
        <Button type="submit" variant="primary" className="w-100" disabled={busy || enabled === null}>
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" /> Creating account…
            </>
          ) : (
            <>
              <i className="fa-solid fa-user-plus me-2" />
              Create account
            </>
          )}
        </Button>
      </Form>
      <div className="mt-3 small">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </AuthShell>
  );
}
