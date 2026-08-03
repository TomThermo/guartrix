import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Form, ListGroup, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { TotpQr } from "../components/TotpQr";
import { ApiKeysPanel } from "../components/ApiKeysPanel";
import { AppPasswordsPanel } from "../components/AppPasswordsPanel";
import { ConfirmModal } from "../components/ConfirmModal";
import { copyText } from "../utils";

type Step = "idle" | "setup" | "recovery" | "disable" | "regen";

export function AccountSecurityPage() {
  const { user, refreshUser, authenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [required, setRequired] = useState(false);
  const [recoveryLeft, setRecoveryLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");

  const [secretGrouped, setSecretGrouped] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [exportBusy, setExportBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const refresh = useCallback(async () => {
    const status = await api.getTwoFactor();
    setEnabled(status.enabled);
    setRequired(status.required);
    setRecoveryLeft(status.recoveryCodesRemaining);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [refresh]);

  if (!authenticated) return <Navigate to="/login" replace />;

  async function startSetup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setRecoveryCodes(null);
    try {
      const setup = await api.setupTwoFactor();
      setSecretGrouped(setup.secretGrouped);
      setOtpauth(setup.otpauthUrl);
      setCode("");
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.enableTwoFactor(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setStep("recovery");
      setCode("");
      await refresh();
      await refreshUser();
      setNotice("Two-factor authentication is now on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSetup() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelTwoFactorSetup();
      setStep("idle");
      setSecretGrouped("");
      setOtpauth("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.disableTwoFactor(password, code.trim());
      setPassword("");
      setCode("");
      setStep("idle");
      setNotice("Two-factor authentication disabled.");
      await refresh();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disable failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegen(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.regenerateRecoveryCodes(password, code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setPassword("");
      setCode("");
      setStep("recovery");
      setNotice("New recovery codes generated — save them now.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    if (!recoveryCodes) return;
    void copyText(recoveryCodes.join("\n")).then(
      () => setNotice("Recovery codes copied."),
      () => undefined,
    );
  }

  async function onExportData() {
    setExportBusy(true);
    setError(null);
    try {
      await api.exportAccountData();
      setNotice("Account data download started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function onDeleteAccount() {
    if (deleteConfirm !== "DELETE") {
      setError('Type DELETE to confirm account deletion.');
      return;
    }
    if (!deletePassword) {
      setError("Password is required.");
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await api.deleteAccount(deletePassword);
      setShowDelete(false);
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">
            <i className="fa-solid fa-shield-halved me-2 text-primary" />
            Account security
          </h1>
          <p className="text-secondary mb-0">
            Two-factor authentication (TOTP) for {user?.username}. SFTP keeps using
            your panel password.
          </p>
        </div>
        <Link to="/" className="btn btn-sm btn-outline-secondary">
          <i className="fa-solid fa-arrow-left me-1" />
          Dashboard
        </Link>
      </div>

      {required && !enabled && (
        <Alert variant="warning">
          <strong>Required for your role.</strong> Enable two-factor authentication
          before you can change servers, users, or other settings.
        </Alert>
      )}

      {error && (
        <Alert variant="danger" className="py-2" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="py-2" onClose={() => setNotice(null)} dismissible>
          {notice}
        </Alert>
      )}

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <h2 className="h6 mb-3">Authenticator app</h2>
          <p className="text-secondary small mb-3">
            Status:{" "}
            {enabled ? (
              <span className="text-success fw-semibold">Enabled</span>
            ) : (
              <span className="text-secondary fw-semibold">Off</span>
            )}
            {required && " · required for your role"}
            {enabled && recoveryLeft > 0 && (
              <> · {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left</>
            )}
          </p>

          {step === "idle" && !enabled && (
            <Button variant="primary" disabled={busy} onClick={() => void startSetup()}>
              {busy ? "Starting…" : "Enable two-factor"}
            </Button>
          )}

          {step === "idle" && enabled && (
            <div className="d-flex flex-wrap gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => {
                  setStep("regen");
                  setCode("");
                  setPassword("");
                  setError(null);
                }}
              >
                New recovery codes
              </Button>
              {!required && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => {
                    setStep("disable");
                    setCode("");
                    setPassword("");
                    setError(null);
                  }}
                >
                  Disable
                </Button>
              )}
            </div>
          )}

          {step === "setup" && (
            <div>
              <ol className="small text-secondary mb-3 ps-3">
                <li>Open Google Authenticator, Authy, 1Password, or similar.</li>
                <li>Scan the QR code below (or type the secret manually).</li>
                <li>Enter the 6-digit code your app shows to confirm.</li>
              </ol>
              <div className="d-flex flex-column flex-sm-row align-items-center gap-3 mb-3">
                <TotpQr value={otpauth} size={208} />
                <div className="w-100">
                  <div className="small text-secondary mb-1">Manual entry secret</div>
                  <div className="bg-dark text-light rounded p-3 font-monospace text-center user-select-all">
                    {secretGrouped}
                  </div>
                  <div className="mt-2 small">
                    <a href={otpauth} className="link-primary">
                      Open in authenticator app
                    </a>
                  </div>
                </div>
              </div>
              <Form onSubmit={confirmEnable}>
                <Form.Group className="mb-3" controlId="enable-code">
                  <Form.Label>Confirm with a 6-digit code</Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                  />
                </Form.Group>
                <div className="d-flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy ? "Verifying…" : "Confirm & enable"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={() => void cancelSetup()}
                  >
                    Cancel
                  </Button>
                </div>
              </Form>
            </div>
          )}

          {step === "disable" && (
            <Form onSubmit={onDisable}>
              <Form.Group className="mb-3" controlId="disable-password">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="disable-code">
                <Form.Label>Authenticator code</Form.Label>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </Form.Group>
              <div className="d-flex flex-wrap gap-2">
                <Button type="submit" variant="danger" disabled={busy}>
                  {busy ? "Disabling…" : "Disable two-factor"}
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => setStep("idle")}
                >
                  Cancel
                </Button>
              </div>
            </Form>
          )}

          {step === "regen" && (
            <Form onSubmit={onRegen}>
              <p className="small text-secondary">
                Old recovery codes stop working as soon as you generate new ones.
              </p>
              <Form.Group className="mb-3" controlId="regen-password">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="regen-code">
                <Form.Label>Authenticator code</Form.Label>
                <Form.Control
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </Form.Group>
              <div className="d-flex flex-wrap gap-2">
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Generating…" : "Generate new codes"}
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => setStep("idle")}
                >
                  Cancel
                </Button>
              </div>
            </Form>
          )}

          {step === "recovery" && recoveryCodes && (
            <div>
              <Alert variant="warning" className="small">
                Save these recovery codes somewhere safe. Each works once. They will
                not be shown again.
              </Alert>
              <ListGroup className="mb-3 font-monospace">
                {recoveryCodes.map((c) => (
                  <ListGroup.Item key={c}>{c}</ListGroup.Item>
                ))}
              </ListGroup>
              <div className="d-flex flex-wrap gap-2">
                <Button variant="outline-secondary" size="sm" onClick={copyCodes}>
                  Copy all
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setRecoveryCodes(null);
                    setStep("idle");
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title className="h5">SFTP app passwords</Card.Title>
          <AppPasswordsPanel onError={setError} />
        </Card.Body>
      </Card>

      <ApiKeysPanel onError={setError} />

      <Card className="mb-4">
        <Card.Body>
          <Card.Title className="h5">Your data</Card.Title>
          <p className="small text-secondary mb-3">
            Download a copy of your account data, or permanently delete your
            account. Deleting signs you out immediately.
          </p>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button
              variant="outline-primary"
              disabled={busy || exportBusy}
              onClick={() => void onExportData()}
            >
              {exportBusy ? "Preparing…" : "Export data"}
            </Button>
            <Button
              variant="outline-danger"
              disabled={busy}
              onClick={() => {
                setDeletePassword("");
                setDeleteConfirm("");
                setShowDelete(true);
              }}
            >
              Delete account
            </Button>
          </div>
        </Card.Body>
      </Card>

      <ConfirmModal
        show={showDelete}
        title="Delete your account?"
        variant="danger"
        confirmLabel="Delete account"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setShowDelete(false);
        }}
        onConfirm={() => void onDeleteAccount()}
        body={
          <div>
            <p className="mb-3">
              This permanently removes your account, API keys, and billing
              records. Owned servers are reassigned to another admin when
              possible. Type <strong>DELETE</strong> and enter your password to
              confirm.
            </p>
            <Form.Group className="mb-3" controlId="delete-confirm">
              <Form.Label>Confirmation</Form.Label>
              <Form.Control
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                disabled={deleteBusy}
              />
            </Form.Group>
            <Form.Group controlId="delete-password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                disabled={deleteBusy}
              />
            </Form.Group>
          </div>
        }
      />
    </>
  );
}
