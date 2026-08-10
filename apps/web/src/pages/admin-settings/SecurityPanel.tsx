import { Button, Col, Form, Row } from "react-bootstrap";
import type { PanelSettings } from "../../api";
import { useI18n } from "../../i18n/react";
import { CLOUDFLARE_TRUSTED_PROXIES, ROLE_OPTIONS } from "./security-panel-constants";
import { SecurityRedisPanel, SecurityTurnstilePanel } from "./SecurityPanelSections";

export { CLOUDFLARE_TRUSTED_PROXIES } from "./security-panel-constants";

export type SecurityPanelProps = {
  httpsEnabled: boolean;
  onHttpsEnabledChange: (value: boolean) => void;
  sessionSecure: boolean;
  onSessionSecureChange: (value: boolean) => void;
  trustProxy: boolean;
  onTrustProxyChange: (value: boolean) => void;
  trustedProxies: string;
  onTrustedProxiesChange: (value: string) => void;
  redisInfo: PanelSettings["redis"] | null;
  busy: boolean;
  onTestRedis: () => void;
  twoFactorRoles: string[];
  onToggleRole: (role: string) => void;
  turnstileEnabled: boolean;
  onTurnstileEnabledChange: (value: boolean) => void;
  turnstileSiteKey: string;
  onTurnstileSiteKeyChange: (value: string) => void;
  turnstileSecretKey: string;
  onTurnstileSecretKeyChange: (value: string) => void;
  turnstileSecretKeySet: boolean;
};

export function SecurityPanel(props: SecurityPanelProps) {
  const { t } = useI18n();
  const {
    httpsEnabled,
    onHttpsEnabledChange,
    sessionSecure,
    onSessionSecureChange,
    trustProxy,
    onTrustProxyChange,
    trustedProxies,
    onTrustedProxiesChange,
    redisInfo,
    busy,
    onTestRedis,
    twoFactorRoles,
    onToggleRole,
    turnstileEnabled,
    onTurnstileEnabledChange,
    turnstileSiteKey,
    onTurnstileSiteKeyChange,
    turnstileSecretKey,
    onTurnstileSecretKeyChange,
    turnstileSecretKeySet,
  } = props;

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
        <Form.Check
          type="switch"
          id="trust-proxy"
          label={t("adminSettings.trustProxy")}
          checked={trustProxy}
          onChange={(e) => onTrustProxyChange(e.target.checked)}
        />
        <Form.Text muted className="d-block">
          {t("adminSettings.trustProxyHelp")}
        </Form.Text>
      </Col>
      <Col xs={12}>
        <Form.Group>
          <Form.Label>{t("adminSettings.trustedProxies")}</Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            value={trustedProxies}
            onChange={(e) => onTrustedProxiesChange(e.target.value)}
            className="font-monospace"
            placeholder="127.0.0.1,::1"
          />
          <Form.Text muted>{t("adminSettings.trustedProxiesHelp")}</Form.Text>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline-secondary"
              onClick={() => onTrustedProxiesChange("")}
            >
              {t("adminSettings.trustedProxiesClear")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline-primary"
              onClick={() => onTrustedProxiesChange(CLOUDFLARE_TRUSTED_PROXIES)}
            >
              {t("adminSettings.trustedProxiesCloudflare")}
            </Button>
          </div>
        </Form.Group>
      </Col>
      <SecurityRedisPanel redisInfo={redisInfo} busy={busy} onTestRedis={onTestRedis} />
      <Col xs={12}>
        <div className="fw-semibold mb-2">{t("adminSettings.twoFactorRoles")}</div>
        <p className="small text-secondary">{t("adminSettings.twoFactorRolesHelp")}</p>
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
      </Col>
      <SecurityTurnstilePanel
        turnstileEnabled={turnstileEnabled}
        onTurnstileEnabledChange={onTurnstileEnabledChange}
        turnstileSiteKey={turnstileSiteKey}
        onTurnstileSiteKeyChange={onTurnstileSiteKeyChange}
        turnstileSecretKey={turnstileSecretKey}
        onTurnstileSecretKeyChange={onTurnstileSecretKeyChange}
        turnstileSecretKeySet={turnstileSecretKeySet}
      />
    </Row>
  );
}
