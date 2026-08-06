import { Button, Col, Form, Row } from "react-bootstrap";
import type { PanelSettings } from "../../api";
import { AdminInsetCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

const ROLE_OPTIONS = ["ADMIN", "OPERATOR", "VIEWER"] as const;

export type SecurityPanelProps = {
  httpsEnabled: boolean;
  onHttpsEnabledChange: (value: boolean) => void;
  sessionSecure: boolean;
  onSessionSecureChange: (value: boolean) => void;
  redisInfo: PanelSettings["redis"] | null;
  busy: boolean;
  onTestRedis: () => void;
  twoFactorRoles: string[];
  onToggleRole: (role: string) => void;
};

export function SecurityPanel({
  httpsEnabled,
  onHttpsEnabledChange,
  sessionSecure,
  onSessionSecureChange,
  redisInfo,
  busy,
  onTestRedis,
  twoFactorRoles,
  onToggleRole,
}: SecurityPanelProps) {
  const { t } = useI18n();

  return (
    <Row className="g-3">
      <Col xs={12}>
        <Form.Check
          type="switch"
          id="https-enabled"
          label={t("adminSettings.httpsEnabled")}
          checked={httpsEnabled}
          onChange={(e) => onHttpsEnabledChange(e.target.checked)}
        />
        <Form.Text muted className="d-block">
          {t("adminSettings.httpsHelp")}
        </Form.Text>
      </Col>
      <Col xs={12}>
        <Form.Check
          type="switch"
          id="session-secure"
          label={t("adminSettings.sessionSecure")}
          checked={sessionSecure}
          onChange={(e) => onSessionSecureChange(e.target.checked)}
        />
      </Col>
      <Col xs={12}>
        <AdminInsetCard>
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-database me-2 text-secondary" aria-hidden />
            Redis (multi-API HA)
          </div>
          <p className="small text-secondary mb-2">
            Configure via installer or <code>.env</code> (
            <code>REDIS_URL</code>, <code>SESSION_STORE</code>,{" "}
            <code>RATE_LIMIT_STORE</code>). Restart required after
            env changes.
          </p>
          {redisInfo ? (
            <dl className="admin-kv mb-2">
              <dt>Status</dt>
              <dd>
                {!redisInfo.configured
                  ? "Not configured"
                  : redisInfo.connected
                    ? "Connected"
                    : redisInfo.error || "Disconnected"}
              </dd>
              <dt>URL</dt>
              <dd className="font-monospace">{redisInfo.urlMasked ?? "—"}</dd>
              <dt>Sessions</dt>
              <dd>{redisInfo.sessionStore}</dd>
              <dt>Rate limits</dt>
              <dd>{redisInfo.rateLimitStore}</dd>
              <dt>Latency</dt>
              <dd>
                {redisInfo.latencyMs != null
                  ? `${redisInfo.latencyMs} ms`
                  : "—"}
              </dd>
            </dl>
          ) : (
            <p className="small text-secondary">Loading…</p>
          )}
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            disabled={busy}
            onClick={onTestRedis}
          >
            Test Redis connection
          </Button>
        </AdminInsetCard>
      </Col>
      <Col xs={12}>
        <Form.Label className="fw-semibold">
          {t("adminSettings.twoFactorRoles")}
        </Form.Label>
        <div className="d-flex flex-wrap gap-3">
          {ROLE_OPTIONS.map((role) => (
            <Form.Check
              key={role}
              type="checkbox"
              id={`2fa-${role}`}
              label={role}
              checked={twoFactorRoles.includes(role)}
              onChange={() => onToggleRole(role)}
            />
          ))}
        </div>
        <Form.Text muted>{t("adminSettings.twoFactorRolesHelp")}</Form.Text>
      </Col>
    </Row>
  );
}
