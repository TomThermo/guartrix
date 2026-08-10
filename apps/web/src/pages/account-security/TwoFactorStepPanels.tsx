import type { FormEvent } from "react";
import { Alert, Button, Form, ListGroup } from "react-bootstrap";
import { TotpQr } from "../../components/TotpQr";
import { AdminInsetCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

export function TwoFactorSetupPanel({
  secretGrouped,
  otpauth,
  code,
  busy,
  onCodeChange,
  onSubmit,
  onCancel,
}: {
  secretGrouped: string;
  otpauth: string;
  code: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
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
      <Form onSubmit={onSubmit}>
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
          <Button type="button" variant="outline-secondary" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </Form>
    </AdminInsetCard>
  );
}

export function TwoFactorPasswordCodePanel({
  idPrefix,
  help,
  password,
  code,
  busy,
  submitLabel,
  submitBusyLabel,
  submitVariant,
  onPasswordChange,
  onCodeChange,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  help?: string;
  password: string;
  code: string;
  busy: boolean;
  submitLabel: string;
  submitBusyLabel: string;
  submitVariant: "primary" | "danger";
  onPasswordChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <AdminInsetCard>
      <Form onSubmit={onSubmit}>
        {help ? <p className="small text-secondary">{help}</p> : null}
        <Form.Group className="mb-3" controlId={`${idPrefix}-password`}>
          <Form.Label>{t("common.password")}</Form.Label>
          <Form.Control
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
          />
        </Form.Group>
        <Form.Group className="mb-3" controlId={`${idPrefix}-code`}>
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
          <Button type="submit" variant={submitVariant} disabled={busy}>
            {busy ? submitBusyLabel : submitLabel}
          </Button>
          <Button type="button" variant="outline-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </Form>
    </AdminInsetCard>
  );
}

export function TwoFactorRecoveryPanel({
  recoveryCodes,
  onCopy,
  onDone,
}: {
  recoveryCodes: string[];
  onCopy: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  return (
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
        <Button variant="outline-secondary" size="sm" onClick={onCopy}>
          {t("account.totpCopyAll")}
        </Button>
        <Button variant="primary" size="sm" onClick={onDone}>
          {t("common.done")}
        </Button>
      </div>
    </AdminInsetCard>
  );
}
