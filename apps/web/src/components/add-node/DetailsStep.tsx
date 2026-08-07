import type { FormEvent } from "react";
import { Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type NodeSslMode = "http" | "https" | "https-proxy";

export type DetailsStepProps = {
  name: string;
  onNameChange: (value: string) => void;
  fqdn: string;
  onFqdnChange: (value: string) => void;
  sslMode: NodeSslMode;
  onSslModeChange: (value: NodeSslMode) => void;
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
  sslMode,
  onSslModeChange,
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
            <Form.Label>
              {t("admin.nodeDisplayName")}{" "}
              <span className="text-danger">*</span>
            </Form.Label>
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
            <Form.Label>
              {t("admin.nodeDomainName")}{" "}
              <span className="text-danger">*</span>
            </Form.Label>
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
            <Form.Label>{t("admin.nodeSslMode")}</Form.Label>
            <Form.Select
              value={sslMode}
              onChange={(e) => onSslModeChange(e.target.value as NodeSslMode)}
            >
              <option value="http">{t("admin.nodeSslHttp")}</option>
              <option value="https">{t("admin.nodeSslHttps")}</option>
              <option value="https-proxy">{t("admin.nodeSslHttpsProxy")}</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>
              {t("admin.nodeConnectPort")}{" "}
              <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number"
              value={daemonPort}
              onChange={(e) => onDaemonPortChange(Number(e.target.value) || 8081)}
              min={1}
              max={65535}
            />
            <Form.Text className="text-secondary">
              {sslMode === "https-proxy"
                ? t("admin.nodePortHintProxy")
                : sslMode === "https"
                  ? t("admin.nodePortHintHttps")
                  : t("admin.nodePortHintHttp")}
            </Form.Text>
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
