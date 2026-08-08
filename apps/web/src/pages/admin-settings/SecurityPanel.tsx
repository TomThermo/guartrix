import { Button, Col, Form, Row } from "react-bootstrap";
import type { PanelSettings } from "../../api";
import { AdminInsetCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

const ROLE_OPTIONS = ["ADMIN", "OPERATOR", "VIEWER"] as const;

/** Cloudflare published edge ranges (v4+v6) — paste into TRUSTED_PROXIES behind orange-cloud. */
export const CLOUDFLARE_TRUSTED_PROXIES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
].join(",");

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

export function SecurityPanel({
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
      <Col xs={12}>
        <AdminInsetCard>
          <div className="fw-semibold mb-1">
            <i className="fa-solid fa-database me-2 text-secondary" aria-hidden />
            Redis (multi-API HA)
          </div>
          <p className="small text-secondary mb-2">
            Configure via installer or <code>.env</code> (<code>REDIS_URL</code>,{" "}
            <code>SESSION_STORE</code>, <code>RATE_LIMIT_STORE</code>). Restart required after env
            changes.
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
              <dd>
                <code>{redisInfo.sessionStore}</code>
              </dd>
              <dt>Rate limits</dt>
              <dd>
                <code>{redisInfo.rateLimitStore}</code>
              </dd>
            </dl>
          ) : (
            <p className="small text-secondary">—</p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            disabled={busy}
            onClick={onTestRedis}
          >
            {t("adminSettings.testRedis")}
          </Button>
        </AdminInsetCard>
      </Col>
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
      <Col xs={12}>
        <AdminInsetCard>
          <div className="fw-semibold mb-2">
            <i className="fa-solid fa-robot me-2 text-secondary" aria-hidden />
            {t("adminSettings.turnstileHeading")}
          </div>
          <p className="small text-secondary mb-3">{t("adminSettings.turnstileHelp")}</p>
          <Form.Check
            type="switch"
            id="turnstile-enabled"
            className="mb-3"
            label={t("adminSettings.turnstileEnabled")}
            checked={turnstileEnabled}
            onChange={(e) => onTurnstileEnabledChange(e.target.checked)}
          />
          <Form.Group className="mb-3">
            <Form.Label>{t("adminSettings.turnstileSiteKey")}</Form.Label>
            <Form.Control
              type="text"
              value={turnstileSiteKey}
              onChange={(e) => onTurnstileSiteKeyChange(e.target.value)}
              className="font-monospace"
              autoComplete="off"
              placeholder="0x4AAAAAAA…"
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>{t("adminSettings.turnstileSecretKey")}</Form.Label>
            <Form.Control
              type="password"
              value={turnstileSecretKey}
              onChange={(e) => onTurnstileSecretKeyChange(e.target.value)}
              className="font-monospace"
              autoComplete="new-password"
              placeholder={
                turnstileSecretKeySet
                  ? t("adminSettings.secretSet")
                  : t("adminSettings.secretEmpty")
              }
            />
          </Form.Group>
        </AdminInsetCard>
      </Col>
    </Row>
  );
}
