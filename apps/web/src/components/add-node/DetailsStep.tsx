import type { FormEvent } from "react";
import { Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type DetailsStepProps = {
  name: string;
  onNameChange: (value: string) => void;
  fqdn: string;
  onFqdnChange: (value: string) => void;
  scheme: "http" | "https";
  onSchemeChange: (value: "http" | "https") => void;
  daemonPort: number;
  onDaemonPortChange: (value: number) => void;
  location: string;
  onLocationChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
};

export function DetailsStep({
  name,
  onNameChange,
  fqdn,
  onFqdnChange,
  scheme,
  onSchemeChange,
  daemonPort,
  onDaemonPortChange,
  location,
  onLocationChange,
  onSubmit,
}: DetailsStepProps) {
  const { t } = useI18n();

  return (
    <Form id="add-node-details" onSubmit={onSubmit}>
      <p className="small text-secondary mb-3">
        Register the node in the panel. You install the daemon in the next step.
      </p>
      <Row className="g-2">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Name</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
              placeholder="node-2"
              autoFocus
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Host / FQDN</Form.Label>
            <Form.Control
              value={fqdn}
              onChange={(e) => onFqdnChange(e.target.value)}
              required
              placeholder="192.168.1.10 or node2.example.com"
            />
            <Form.Text className="text-secondary">
              IP/hostname reachable from the panel server.
            </Form.Text>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Scheme</Form.Label>
            <Form.Select
              value={scheme}
              onChange={(e) => onSchemeChange(e.target.value as "http" | "https")}
            >
              <option value="http">http (default LAN/VPS)</option>
              <option value="https">https (TLS for the daemon)</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Daemon port</Form.Label>
            <Form.Control
              type="number"
              value={daemonPort}
              onChange={(e) => onDaemonPortChange(Number(e.target.value) || 8081)}
              min={1}
              max={65535}
            />
          </Form.Group>
        </Col>
        <Col md={12}>
          <Form.Group>
            <Form.Label>{t("admin.locationLabel")}</Form.Label>
            <Form.Control
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              maxLength={64}
              placeholder={t("admin.locationPlaceholder")}
            />
            <Form.Text className="text-secondary">
              {t("admin.locationHint")}
            </Form.Text>
          </Form.Group>
        </Col>
      </Row>
    </Form>
  );
}
