import { Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type AlertsPanelProps = {
  activityWebhookUrl: string;
  onActivityWebhookUrlChange: (value: string) => void;
  alertEmail: string;
  onAlertEmailChange: (value: string) => void;
  activityAlertMute: string;
  onActivityAlertMuteChange: (value: string) => void;
};

export function AlertsPanel({
  activityWebhookUrl,
  onActivityWebhookUrlChange,
  alertEmail,
  onAlertEmailChange,
  activityAlertMute,
  onActivityAlertMuteChange,
}: AlertsPanelProps) {
  const { t } = useI18n();

  return (
    <Row className="g-3">
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.activityWebhookUrl")}</Form.Label>
          <Form.Control
            value={activityWebhookUrl}
            onChange={(e) => onActivityWebhookUrlChange(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
          />
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.alertEmail")}</Form.Label>
          <Form.Control
            type="email"
            value={alertEmail}
            onChange={(e) => onAlertEmailChange(e.target.value)}
          />
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Form.Group>
          <Form.Label>{t("adminSettings.activityAlertMute")}</Form.Label>
          <Form.Control
            value={activityAlertMute}
            onChange={(e) => onActivityAlertMuteChange(e.target.value)}
            placeholder="auth.login-failed, …"
          />
          <Form.Text muted>{t("adminSettings.activityAlertMuteHelp")}</Form.Text>
        </Form.Group>
      </Col>
    </Row>
  );
}
