import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { useI18n } from "../../../i18n/react";
import { schemeFromSslMode, type SslMode } from "./parse-daemon-url";

export type NodeBasicSettingsPanelProps = {
  busy: boolean;
  name: string;
  onNameChange: (value: string) => void;
  fqdn: string;
  onFqdnChange: (value: string) => void;
  daemonPort: string;
  onDaemonPortChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  sslMode: SslMode;
  onSslModeChange: (mode: SslMode) => void;
  dnsLoading: boolean;
  dnsOk: boolean | null;
  dnsAddresses: string[];
  panelSecure: boolean;
  onSave: () => void;
};

export function NodeBasicSettingsPanel({
  busy,
  name,
  onNameChange,
  fqdn,
  onFqdnChange,
  daemonPort,
  onDaemonPortChange,
  location,
  onLocationChange,
  sslMode,
  onSslModeChange,
  dnsLoading,
  dnsOk,
  dnsAddresses,
  panelSecure,
  onSave,
}: NodeBasicSettingsPanelProps) {
  const { t } = useI18n();

  return (
    <Form
      className="node-basic"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
    >
      <section className="admin-inset-card node-basic__toolbar">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h2 className="admin-section-title mb-0">
            <i className="fa-solid fa-sliders" aria-hidden />
            {t("admin.nodeTabBasic")}
          </h2>
          <Button type="submit" size="sm" variant="primary" disabled={busy}>
            {busy ? (
              <Spinner size="sm" animation="border" />
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk me-1" aria-hidden />
                {t("common.save")}
              </>
            )}
          </Button>
        </div>
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-server" aria-hidden />
          {t("admin.nodeInformation")}
        </h2>
        <div className="node-basic-grid">
          <Form.Group className="node-basic-field">
            <Form.Label>
              {t("admin.nodeDisplayName")} <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={64}
              required
            />
          </Form.Group>

          <Form.Group className="node-basic-field node-basic-field--domain">
            <Form.Label>
              {t("admin.nodeDomainName")} <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              className="font-monospace"
              value={fqdn}
              onChange={(e) => onFqdnChange(e.target.value)}
              placeholder="node.example.com"
              required
            />
            <div className="node-basic-field__meta">
              {dnsLoading ? (
                <span className="text-secondary">
                  <Spinner size="sm" animation="border" className="me-1" />
                  {t("admin.nodeDnsChecking")}
                </span>
              ) : dnsOk === true && dnsAddresses[0] ? (
                <span className="text-success">
                  <i className="fa-solid fa-circle-check me-1" aria-hidden />
                  {t("admin.nodeDnsValid", { ip: dnsAddresses[0] })}
                </span>
              ) : dnsOk === false ? (
                <span className="text-warning">
                  <i className="fa-solid fa-triangle-exclamation me-1" aria-hidden />
                  {t("admin.nodeDnsInvalid")}
                </span>
              ) : null}
            </div>
          </Form.Group>

          <Form.Group className="node-basic-field node-basic-field--port">
            <Form.Label>
              {t("admin.nodeConnectPort")} <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number"
              value={daemonPort}
              onChange={(e) => onDaemonPortChange(e.target.value)}
              min={1}
              max={65535}
              required
            />
            <Form.Text muted>
              {sslMode === "https-proxy"
                ? t("admin.nodePortHintProxy")
                : sslMode === "https"
                  ? t("admin.nodePortHintHttps")
                  : t("admin.nodePortHintHttp")}
            </Form.Text>
          </Form.Group>

          <Form.Group className="node-basic-field node-basic-field--location">
            <Form.Label>{t("admin.locationLabel")}</Form.Label>
            <Form.Control
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              maxLength={64}
              placeholder={t("admin.locationPlaceholder")}
            />
            <Form.Text muted>{t("admin.locationHint")}</Form.Text>
          </Form.Group>

          <div className="node-basic-preview">
            <div className="node-basic-preview__label">{t("admin.nodePreviewUrl")}</div>
            <div className="node-basic-preview__value font-monospace">
              {`${schemeFromSslMode(sslMode)}://${fqdn.trim() || "…"}:${daemonPort || "…"}`}
            </div>
            {sslMode === "https-proxy" ? (
              <span className="badge text-bg-secondary mt-2">
                {t("admin.nodeBehindProxyBadge")}
              </span>
            ) : null}
          </div>
        </div>
        {panelSecure && sslMode === "http" && (
          <Alert variant="warning" className="py-2 small mt-3 mb-0">
            {t("admin.nodeSslRequiredHint")}
          </Alert>
        )}
      </section>

      <section className="admin-inset-card">
        <h2 className="admin-section-title mb-3">
          <i className="fa-solid fa-lock" aria-hidden />
          {t("admin.nodeSslMode")}
        </h2>
        <div className="node-ssl-cards" role="group" aria-label={t("admin.nodeSslMode")}>
          {(
            [
              ["http", "fa-lock-open", t("admin.nodeSslHttp"), t("admin.nodeSslHttpHint")],
              ["https", "fa-lock", t("admin.nodeSslHttps"), t("admin.nodeSslHttpsHint")],
              [
                "https-proxy",
                "fa-shield-halved",
                t("admin.nodeSslHttpsProxy"),
                t("admin.nodeSslProxyHint"),
              ],
            ] as const
          ).map(([mode, icon, label, hint]) => (
            <button
              key={mode}
              type="button"
              className={sslMode === mode ? "node-ssl-card node-ssl-card--active" : "node-ssl-card"}
              aria-pressed={sslMode === mode}
              onClick={() => onSslModeChange(mode)}
            >
              <span className="node-ssl-card__icon" aria-hidden>
                <i className={`fa-solid ${icon}`} />
              </span>
              <span className="node-ssl-card__title">{label}</span>
              <span className="node-ssl-card__hint">{hint}</span>
            </button>
          ))}
        </div>
        {panelSecure && sslMode === "http" && (
          <Alert variant="danger" className="py-2 small mt-3 mb-0">
            {t("admin.nodeSslMismatch")}
          </Alert>
        )}
      </section>
    </Form>
  );
}
