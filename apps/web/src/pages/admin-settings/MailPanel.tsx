import { Button, Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type MailPanelProps = {
  mailFrom: string;
  onMailFromChange: (value: string) => void;
  smtpHost: string;
  onSmtpHostChange: (value: string) => void;
  smtpPort: number;
  onSmtpPortChange: (value: number) => void;
  smtpSecure: boolean;
  onSmtpSecureChange: (value: boolean) => void;
  smtpStartTls: boolean;
  onSmtpStartTlsChange: (value: boolean) => void;
  smtpUser: string;
  onSmtpUserChange: (value: string) => void;
  smtpPass: string;
  onSmtpPassChange: (value: string) => void;
  smtpPassSet: boolean;
  smtpConfigured: boolean;
  busy: boolean;
  onTestMail: () => void;
};

export function MailPanel({
  mailFrom,
  onMailFromChange,
  smtpHost,
  onSmtpHostChange,
  smtpPort,
  onSmtpPortChange,
  smtpSecure,
  onSmtpSecureChange,
  smtpStartTls,
  onSmtpStartTlsChange,
  smtpUser,
  onSmtpUserChange,
  smtpPass,
  onSmtpPassChange,
  smtpPassSet,
  smtpConfigured,
  busy,
  onTestMail,
}: MailPanelProps) {
  const { t } = useI18n();

  return (
    <Row className="g-3">
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.mailFrom")}</Form.Label>
          <Form.Control value={mailFrom} onChange={(e) => onMailFromChange(e.target.value)} />
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.smtpHost")}</Form.Label>
          <Form.Control
            value={smtpHost}
            onChange={(e) => onSmtpHostChange(e.target.value)}
            placeholder="smtp.example.com"
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>{t("adminSettings.smtpPort")}</Form.Label>
          <Form.Control
            type="number"
            min={1}
            max={65535}
            value={smtpPort}
            onChange={(e) => onSmtpPortChange(Number(e.target.value) || 465)}
          />
        </Form.Group>
      </Col>
      <Col md={4} className="d-flex align-items-end">
        <Form.Check
          type="switch"
          id="smtp-secure"
          label={t("adminSettings.smtpSecure")}
          checked={smtpSecure}
          onChange={(e) => onSmtpSecureChange(e.target.checked)}
        />
      </Col>
      <Col md={4} className="d-flex align-items-end">
        <Form.Check
          type="switch"
          id="smtp-starttls"
          label={t("adminSettings.smtpStartTls")}
          checked={smtpStartTls}
          onChange={(e) => onSmtpStartTlsChange(e.target.checked)}
        />
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.smtpUser")}</Form.Label>
          <Form.Control
            value={smtpUser}
            onChange={(e) => onSmtpUserChange(e.target.value)}
            autoComplete="off"
          />
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.smtpPass")}</Form.Label>
          <Form.Control
            type="password"
            autoComplete="new-password"
            value={smtpPass}
            onChange={(e) => onSmtpPassChange(e.target.value)}
            placeholder={
              smtpPassSet ? t("adminSettings.secretSet") : t("adminSettings.secretEmpty")
            }
          />
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Button
          type="button"
          variant="outline-secondary"
          disabled={busy || !smtpConfigured}
          onClick={onTestMail}
        >
          {t("adminSettings.testMail")}
        </Button>
        {!smtpConfigured && (
          <span className="small text-secondary ms-2">{t("adminSettings.smtpRequired")}</span>
        )}
      </Col>
    </Row>
  );
}
