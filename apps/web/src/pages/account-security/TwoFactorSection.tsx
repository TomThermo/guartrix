import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Form, ListGroup, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { TotpQr } from "../../components/TotpQr";
import { AdminInsetCard, AdminPanelCard } from "../../components/admin/AdminPageShell";
import { copyText } from "../../utils";

export type TwoFactorStep = "idle" | "setup" | "recovery" | "disable" | "regen";

export type TwoFactorStatus = {
  enabled: boolean;
  required: boolean;
};

type Props = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
  onStatusChange?: (status: TwoFactorStatus) => void;
};

export function TwoFactorSection({ onNotice, onError, onStatusChange }: Props) {
  const { refreshUser } = useAuth();
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [required, setRequired] = useState(false);
  const [recoveryLeft, setRecoveryLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<TwoFactorStep>("idle");
  const [secretGrouped, setSecretGrouped] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    const status = await api.getTwoFactor();
    setEnabled(status.enabled);
    setRequired(status.required);
    setRecoveryLeft(status.recoveryCodesRemaining);
    onStatusChange?.({ enabled: status.enabled, required: status.required });
  }, [onStatusChange]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : t("common.requestFailed")))
      .finally(() => setLoading(false));
  }, [refresh, onError, t]);

  async function startSetup() {
    setBusy(true);
    onError(null);
    onNotice(null);
    setRecoveryCodes(null);
    try {
      const setup = await api.setupTwoFactor();
      setSecretGrouped(setup.secretGrouped);
      setOtpauth(setup.otpauthUrl);
      setCode("");
      setStep("setup");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const result = await api.enableTwoFactor(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setStep("recovery");
      setCode("");
      await refresh();
      await refreshUser();
      onNotice("Two-factor authentication is now on.");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("auth.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSetup() {
    setBusy(true);
    onError(null);
    try {
      await api.cancelTwoFactorSetup();
      setStep("idle");
      setSecretGrouped("");
      setOtpauth("");
      setCode("");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await api.disableTwoFactor(password, code.trim());
      setPassword("");
      setCode("");
      setStep("idle");
      onNotice("Two-factor authentication disabled.");
      await refresh();
      await refreshUser();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRegen(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const result = await api.regenerateRecoveryCodes(password, code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setPassword("");
      setCode("");
      setStep("recovery");
      onNotice("New recovery codes generated — save them now.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    if (!recoveryCodes) return;
    void copyText(recoveryCodes.join("\n")).then(
      () => onNotice("Recovery codes copied."),
      () => undefined,
    );
  }

  if (loading) {
    return (
      <div className="text-secondary py-4">
        <Spinner size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <AdminPanelCard title={t("account.totpTitle")} icon="fa-mobile-screen" className="mb-4">
      <div className="account-status-row">
        <span>{t("account.totpStatus")}</span>
        <span className={`account-status-chip ${enabled ? "is-on" : "is-off"}`}>
          <i className={`fa-solid ${enabled ? "fa-lock" : "fa-lock-open"}`} aria-hidden />
          {enabled ? t("common.enabled") : t("common.off")}
        </span>
        {required && (
          <span className="account-status-chip is-off">
            {t("account.totpRequiredRole").replace(/^ · /, "")}
          </span>
        )}
        {enabled && recoveryLeft > 0 && (
          <span className="account-status-chip is-on">
            {recoveryLeft === 1
              ? t("account.totpRecoveryLeft", { count: recoveryLeft }).replace(/^ · /, "")
              : t("account.totpRecoveryLeftPlural", { count: recoveryLeft }).replace(/^ · /, "")}
          </span>
        )}
      </div>

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
              onError(null);
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
                onError(null);
              }}
            >
              {t("account.totpDisable")}
            </Button>
          )}
        </div>
      )}

      {step === "setup" && (
        <AdminInsetCard>
          <ol className="small text-secondary mb-3 ps-3">
            <li>{t("account.totpStep1")}</li>
            <li>{t("account.totpStep2")}</li>
            <li>{t("account.totpStep3")}</li>
          </ol>
          <div className="d-flex flex-column flex-sm-row align-items-center gap-3 mb-3">
            <TotpQr value={otpauth} size={208} />
            <div className="w-100">
              <div className="small text-secondary mb-1">{t("account.totpManualSecret")}</div>
              <div className="account-totp-secret">{secretGrouped}</div>
              <div className="mt-2 small">
                <a href={otpauth} className="link-primary">
                  {t("account.totpOpenApp")}
                </a>
              </div>
            </div>
          </div>
          <Form onSubmit={(e) => void confirmEnable(e)}>
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
        </AdminInsetCard>
      )}

      {step === "disable" && (
        <AdminInsetCard>
          <Form onSubmit={(e) => void onDisable(e)}>
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
              <Button type="button" variant="outline-secondary" onClick={() => setStep("idle")}>
                {t("common.cancel")}
              </Button>
            </div>
          </Form>
        </AdminInsetCard>
      )}

      {step === "regen" && (
        <AdminInsetCard>
          <Form onSubmit={(e) => void onRegen(e)}>
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
              <Button type="button" variant="outline-secondary" onClick={() => setStep("idle")}>
                {t("common.cancel")}
              </Button>
            </div>
          </Form>
        </AdminInsetCard>
      )}

      {step === "recovery" && recoveryCodes && (
        <AdminInsetCard>
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
        </AdminInsetCard>
      )}
    </AdminPanelCard>
  );
}
