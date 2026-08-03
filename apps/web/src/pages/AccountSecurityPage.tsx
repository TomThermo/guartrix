import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Form, ListGroup, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import type { Locale } from "../i18n";
import { TotpQr } from "../components/TotpQr";
import { ApiKeysPanel } from "../components/ApiKeysPanel";
import { AppPasswordsPanel } from "../components/AppPasswordsPanel";
import { ConfirmModal } from "../components/ConfirmModal";
import { copyText } from "../utils";
import {
  readThemePreference,
  setThemePreference,
  watchSystemTheme,
  type ThemePreference,
} from "../theme";
import {
  getExistingPushSubscription,
  pushSupported,
  serializePushSubscription,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "../push";

type Step = "idle" | "setup" | "recovery" | "disable" | "regen";

export function AccountSecurityPage() {
  const { user, refreshUser, authenticated, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
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
  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    readThemePreference(),
  );
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushCount, setPushCount] = useState(0);
  const [pushLocal, setPushLocal] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    return watchSystemTheme(themePref);
  }, [themePref]);

  const refresh = useCallback(async () => {
    const status = await api.getTwoFactor();
    setEnabled(status.enabled);
    setRequired(status.required);
    setRecoveryLeft(status.recoveryCodesRemaining);
  }, []);

  const refreshPush = useCallback(async () => {
    try {
      const status = await api.getPushStatus();
      setPushConfigured(status.configured);
      setPushCount(status.subscriptionCount);
    } catch {
      setPushConfigured(false);
      setPushCount(0);
    }
    if (pushSupported()) {
      const sub = await getExistingPushSubscription();
      setPushLocal(Boolean(sub));
    } else {
      setPushLocal(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void Promise.all([refresh(), refreshPush()])
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("common.requestFailed")),
      )
      .finally(() => setLoading(false));
  }, [refresh, refreshPush]);

  async function enablePush() {
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      const status = await api.getPushStatus();
      if (!status.configured || !status.publicKey) {
        throw new Error(t("account.pushNotConfigured"));
      }
      const sub = await subscribeBrowserPush(status.publicKey);
      await api.subscribePush({
        ...serializePushSubscription(sub),
        userAgent: navigator.userAgent.slice(0, 512),
      });
      setNotice("Push alerts enabled for this browser.");
      await refreshPush();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = await unsubscribeBrowserPush();
      if (endpoint) await api.unsubscribePush(endpoint);
      else await api.clearPushSubscriptions();
      setNotice("Push alerts disabled for this browser.");
      await refreshPush();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setPushBusy(false);
    }
  }

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
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
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
      setError(err instanceof Error ? err.message : t("auth.invalidCode"));
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
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
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
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
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
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
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
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
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
      setError(`${t("common.required")}: ${t("common.password")}`);
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
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
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
            {t("account.title")}
          </h1>
          <p className="text-secondary mb-0">
            {t("account.subtitle", { username: user?.username ?? "" })}
          </p>
        </div>
        <Link to="/" className="btn btn-sm btn-outline-secondary">
          <i className="fa-solid fa-arrow-left me-1" />
          {t("nav.dashboard")}
        </Link>
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <h2 className="h6 mb-2">{t("account.language")}</h2>
          <p className="text-secondary small mb-3">{t("account.languageHelp")}</p>
          <Form.Group controlId="account-language" className="mb-0" style={{ maxWidth: 280 }}>
            <Form.Select
              value={locale}
              aria-label={t("account.language")}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="en">{t("account.languageEn")}</option>
              <option value="nl">{t("account.languageNl")}</option>
            </Form.Select>
          </Form.Group>
        </Card.Body>
      </Card>

      {required && !enabled && (
        <Alert variant="warning">{t("account.requiredRole")}</Alert>
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
          <h2 className="h6 mb-3">{t("account.appearance")}</h2>
          <p className="text-secondary small mb-3">{t("account.appearanceHelp")}</p>
          <Form>
            {(
              [
                {
                  value: "dark" as const,
                  label: t("account.themeDark"),
                  hint: t("account.themeDarkHint"),
                },
                {
                  value: "light" as const,
                  label: t("account.themeLight"),
                  hint: t("account.themeLightHint"),
                },
                {
                  value: "system" as const,
                  label: t("account.themeSystem"),
                  hint: t("account.themeSystemHint"),
                },
              ]
            ).map((opt) => (
              <Form.Check
                key={opt.value}
                type="radio"
                id={`theme-${opt.value}`}
                name="guartrix-theme"
                className="mb-2"
                label={
                  <span>
                    {opt.label}
                    <span className="text-secondary small ms-2">{opt.hint}</span>
                  </span>
                }
                checked={themePref === opt.value}
                onChange={() => {
                  setThemePref(opt.value);
                  setThemePreference(opt.value);
                }}
              />
            ))}
          </Form>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <h2 className="h6 mb-2">{t("account.pushTitle")}</h2>
          <p className="text-secondary small mb-3">{t("account.pushHelp")}</p>
          {!pushSupported() ? (
            <p className="text-secondary small mb-0">{t("account.pushUnsupported")}</p>
          ) : !pushConfigured ? (
            <Alert variant="secondary" className="py-2 mb-0">
              {t("account.pushNotConfigured")}
            </Alert>
          ) : (
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="small text-secondary">
                {t("account.pushThisBrowser")}{" "}
                <strong className={pushLocal ? "text-success" : undefined}>
                  {pushLocal ? t("account.pushEnabled") : t("account.pushOff")}
                </strong>
                {pushCount > 0 && (
                  <>
                    {" "}
                    {pushCount === 1
                      ? t("account.pushDevices", { count: pushCount })
                      : t("account.pushDevicesPlural", { count: pushCount })}
                  </>
                )}
              </span>
              {pushLocal ? (
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={pushBusy}
                  onClick={() => void disablePush()}
                >
                  {pushBusy ? t("common.waiting") : t("account.pushDisable")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={pushBusy}
                  onClick={() => void enablePush()}
                >
                  {pushBusy ? t("common.waiting") : t("account.pushEnable")}
                </Button>
              )}
            </div>
          )}
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <h2 className="h6 mb-3">{t("account.totpTitle")}</h2>
          <p className="text-secondary small mb-3">
            {t("account.totpStatus")}{" "}
            {enabled ? (
              <span className="text-success fw-semibold">{t("common.enabled")}</span>
            ) : (
              <span className="text-secondary fw-semibold">{t("common.off")}</span>
            )}
            {required && t("account.totpRequiredRole")}
            {enabled && recoveryLeft > 0 && (
              <>
                {recoveryLeft === 1
                  ? t("account.totpRecoveryLeft", { count: recoveryLeft })
                  : t("account.totpRecoveryLeftPlural", { count: recoveryLeft })}
              </>
            )}
          </p>

          {step === "idle" && !enabled && (
            <Button variant="primary" disabled={busy} onClick={() => void startSetup()}>
              {busy ? t("account.totpStarting") : t("account.totpEnable")}
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
                {t("account.totpNewRecovery")}
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
                  {t("account.totpDisable")}
                </Button>
              )}
            </div>
          )}

          {step === "setup" && (
            <div>
              <ol className="small text-secondary mb-3 ps-3">
                <li>{t("account.totpStep1")}</li>
                <li>{t("account.totpStep2")}</li>
                <li>{t("account.totpStep3")}</li>
              </ol>
              <div className="d-flex flex-column flex-sm-row align-items-center gap-3 mb-3">
                <TotpQr value={otpauth} size={208} />
                <div className="w-100">
                  <div className="small text-secondary mb-1">
                    {t("account.totpManualSecret")}
                  </div>
                  <div className="bg-dark text-light rounded p-3 font-monospace text-center user-select-all">
                    {secretGrouped}
                  </div>
                  <div className="mt-2 small">
                    <a href={otpauth} className="link-primary">
                      {t("account.totpOpenApp")}
                    </a>
                  </div>
                </div>
              </div>
              <Form onSubmit={confirmEnable}>
                <Form.Group className="mb-3" controlId="enable-code">
                  <Form.Label>{t("account.totpConfirmCode")}</Form.Label>
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
                    {busy ? t("auth.verifying") : t("account.totpConfirmEnable")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={() => void cancelSetup()}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </Form>
            </div>
          )}

          {step === "disable" && (
            <Form onSubmit={onDisable}>
              <Form.Group className="mb-3" controlId="disable-password">
                <Form.Label>{t("common.password")}</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="disable-code">
                <Form.Label>{t("account.totpAuthenticatorCode")}</Form.Label>
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
                  {busy ? t("account.totpDisabling") : t("account.totpDisableConfirm")}
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => setStep("idle")}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </Form>
          )}

          {step === "regen" && (
            <Form onSubmit={onRegen}>
              <p className="small text-secondary">{t("account.totpRegenHelp")}</p>
              <Form.Group className="mb-3" controlId="regen-password">
                <Form.Label>{t("common.password")}</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="regen-code">
                <Form.Label>{t("account.totpAuthenticatorCode")}</Form.Label>
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
                  {busy ? t("account.totpGenerating") : t("account.totpGenerateCodes")}
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => setStep("idle")}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </Form>
          )}

          {step === "recovery" && recoveryCodes && (
            <div>
              <Alert variant="warning" className="small">
                {t("account.totpSaveCodes")}
              </Alert>
              <ListGroup className="mb-3 font-monospace">
                {recoveryCodes.map((c) => (
                  <ListGroup.Item key={c}>{c}</ListGroup.Item>
                ))}
              </ListGroup>
              <div className="d-flex flex-wrap gap-2">
                <Button variant="outline-secondary" size="sm" onClick={copyCodes}>
                  {t("account.totpCopyAll")}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setRecoveryCodes(null);
                    setStep("idle");
                  }}
                >
                  {t("common.done")}
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title className="h5">{t("account.sftpAppPasswords")}</Card.Title>
          <AppPasswordsPanel onError={setError} />
        </Card.Body>
      </Card>

      <ApiKeysPanel onError={setError} />

      <Card className="mb-4">
        <Card.Body>
          <Card.Title className="h5">{t("account.yourData")}</Card.Title>
          <p className="small text-secondary mb-3">{t("account.yourDataHelp")}</p>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button
              variant="outline-primary"
              disabled={busy || exportBusy}
              onClick={() => void onExportData()}
            >
              {exportBusy ? t("account.exportPreparing") : t("account.exportData")}
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
              {t("account.deleteAccount")}
            </Button>
          </div>
        </Card.Body>
      </Card>

      <ConfirmModal
        show={showDelete}
        title={t("account.deleteAccountTitle")}
        variant="danger"
        confirmLabel={t("account.deleteAccount")}
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setShowDelete(false);
        }}
        onConfirm={() => void onDeleteAccount()}
        body={
          <div>
            <p className="mb-3">{t("account.deleteAccountBody")}</p>
            <Form.Group className="mb-3" controlId="delete-confirm">
              <Form.Label>{t("account.deleteConfirmation")}</Form.Label>
              <Form.Control
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                disabled={deleteBusy}
              />
            </Form.Group>
            <Form.Group controlId="delete-password">
              <Form.Label>{t("common.password")}</Form.Label>
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
