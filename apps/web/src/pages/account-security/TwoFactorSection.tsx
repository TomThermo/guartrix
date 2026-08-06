import type { FormEvent } from "react";
import { Alert, Button, Form, ListGroup } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { TotpQr } from "../../components/TotpQr";
import {
  AdminInsetCard,
  AdminPanelCard,
} from "../../components/admin/AdminPageShell";

export type TwoFactorStep = "idle" | "setup" | "recovery" | "disable" | "regen";

interface Props {
  enabled: boolean;
  required: boolean;
  recoveryLeft: number;
  busy: boolean;
  step: TwoFactorStep;
  secretGrouped: string;
  otpauth: string;
  code: string;
  password: string;
  recoveryCodes: string[] | null;
  onCodeChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onStartSetup: () => void;
  onConfirmEnable: (e: FormEvent) => void;
  onCancelSetup: () => void;
  onDisable: (e: FormEvent) => void;
  onRegen: (e: FormEvent) => void;
  onCopyCodes: () => void;
  onBeginRegen: () => void;
  onBeginDisable: () => void;
  onCancelStep: () => void;
  onDoneRecovery: () => void;
}

export function TwoFactorSection({
  enabled,
  required,
  recoveryLeft,
  busy,
  step,
  secretGrouped,
  otpauth,
  code,
  password,
  recoveryCodes,
  onCodeChange,
  onPasswordChange,
  onStartSetup,
  onConfirmEnable,
  onCancelSetup,
  onDisable,
  onRegen,
  onCopyCodes,
  onBeginRegen,
  onBeginDisable,
  onCancelStep,
  onDoneRecovery,
}: Props) {
  const { t } = useI18n();

  return (
    <AdminPanelCard title={t("account.totpTitle")} icon="fa-mobile-screen" className="mb-4">
      <div className="account-status-row">
        <span>{t("account.totpStatus")}</span>
        <span className={`account-status-chip ${enabled ? "is-on" : "is-off"}`}>
          <i className={`fa-solid ${enabled ? "fa-lock" : "fa-lock-open"}`} aria-hidden />
          {enabled ? t("common.enabled") : t("common.off")}
        </span>
        {required && (
          <span className="account-status-chip is-off">{t("account.totpRequiredRole").replace(/^ · /, "")}</span>
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
        <Button variant="primary" disabled={busy} onClick={() => void onStartSetup()}>
          {busy ? t("account.totpStarting") : t("account.totpEnable")}
        </Button>
      )}

      {step === "idle" && enabled && (
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-secondary" size="sm" onClick={onBeginRegen}>
            {t("account.totpNewRecovery")}
          </Button>
          {!required && (
            <Button variant="outline-danger" size="sm" onClick={onBeginDisable}>
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
          <Form onSubmit={onConfirmEnable}>
            <Form.Group className="mb-3" controlId="enable-code">
              <Form.Label>{t("account.totpConfirmCode")}</Form.Label>
              <Form.Control
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
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
                onClick={() => void onCancelSetup()}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </Form>
        </AdminInsetCard>
      )}

      {step === "disable" && (
        <AdminInsetCard>
          <Form onSubmit={onDisable}>
            <Form.Group className="mb-3" controlId="disable-password">
              <Form.Label>{t("common.password")}</Form.Label>
              <Form.Control
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
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
                onChange={(e) => onCodeChange(e.target.value)}
                required
              />
            </Form.Group>
            <div className="d-flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={busy}>
                {busy ? t("account.totpDisabling") : t("account.totpDisableConfirm")}
              </Button>
              <Button type="button" variant="outline-secondary" onClick={onCancelStep}>
                {t("common.cancel")}
              </Button>
            </div>
          </Form>
        </AdminInsetCard>
      )}

      {step === "regen" && (
        <AdminInsetCard>
          <Form onSubmit={onRegen}>
            <p className="small text-secondary">{t("account.totpRegenHelp")}</p>
            <Form.Group className="mb-3" controlId="regen-password">
              <Form.Label>{t("common.password")}</Form.Label>
              <Form.Control
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
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
                onChange={(e) => onCodeChange(e.target.value)}
                required
              />
            </Form.Group>
            <div className="d-flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? t("account.totpGenerating") : t("account.totpGenerateCodes")}
              </Button>
              <Button type="button" variant="outline-secondary" onClick={onCancelStep}>
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
            <Button variant="outline-secondary" size="sm" onClick={onCopyCodes}>
              {t("account.totpCopyAll")}
            </Button>
            <Button variant="primary" size="sm" onClick={onDoneRecovery}>
              {t("common.done")}
            </Button>
          </div>
        </AdminInsetCard>
      )}
    </AdminPanelCard>
  );
}
