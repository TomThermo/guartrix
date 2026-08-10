import { Button, Col, Form } from "react-bootstrap";
import type { PanelSettings } from "../../api";
import { AdminInsetCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

export function SecurityRedisPanel({
  redisInfo,
  busy,
  onTestRedis,
}: {
  redisInfo: PanelSettings["redis"] | null;
  busy: boolean;
  onTestRedis: () => void;
}) {
  const { t } = useI18n();
  return (
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
  );
}

export function SecurityTurnstilePanel({
  turnstileEnabled,
  onTurnstileEnabledChange,
  turnstileSiteKey,
  onTurnstileSiteKeyChange,
  turnstileSecretKey,
  onTurnstileSecretKeyChange,
  turnstileSecretKeySet,
}: {
  turnstileEnabled: boolean;
  onTurnstileEnabledChange: (value: boolean) => void;
  turnstileSiteKey: string;
  onTurnstileSiteKeyChange: (value: string) => void;
  turnstileSecretKey: string;
  onTurnstileSecretKeyChange: (value: string) => void;
  turnstileSecretKeySet: boolean;
}) {
  const { t } = useI18n();
  return (
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
  );
}
