import { Badge, Button, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { FEATURE_GROUPS, Meta, type LicenseInfo } from "./licenseShared";

export function LicenseStatusCard({
  info,
  busy,
  onRevalidate,
  onRemoveKey,
}: {
  info: LicenseInfo;
  busy: boolean;
  onRevalidate: () => void;
  onRemoveKey: () => void;
}) {
  const { t } = useI18n();
  const statusVariant =
    info.status === "valid" ? "success" : info.status === "unreachable" ? "warning" : "danger";
  const boundList = info.boundIps?.length ? info.boundIps : info.boundIp ? [info.boundIp] : [];

  return (
    <section className="license-panel">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Badge bg={statusVariant}>{info.status}</Badge>
          {info.freeTier && (
            <Badge bg="warning" text="dark">
              Free tier
            </Badge>
          )}
          {info.label && <Badge bg="secondary">{info.label}</Badge>}
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button size="sm" variant="outline-primary" disabled={busy} onClick={onRevalidate}>
            {busy ? <Spinner size="sm" /> : "Revalidate"}
          </Button>
          {info.hasKey && (
            <Button size="sm" variant="outline-danger" disabled={busy} onClick={onRemoveKey}>
              {t("common.remove")}
            </Button>
          )}
        </div>
      </div>

      <p className="small mb-3">{info.message}</p>

      <div className="license-meta-grid mb-3">
        <Meta label="Key" mono>
          {info.keyMasked || "—"}
        </Meta>
        <Meta label="Expires">
          {info.expiresAt
            ? new Date(info.expiresAt).toLocaleString()
            : info.status === "valid"
              ? t("common.unlimited")
              : "—"}
        </Meta>
        <Meta label="Bound IP" mono>
          {boundList.length ? boundList.join(", ") : "unbound"}
        </Meta>
        <Meta label="Checked">{new Date(info.checkedAt).toLocaleString()}</Meta>
      </div>

      <div className="mb-1 small text-secondary">Features</div>
      <div className="d-flex flex-wrap gap-1">
        {FEATURE_GROUPS.map((g) => {
          const enabled = info.features == null || info.features.includes(g.id);
          return (
            <Badge
              key={g.id}
              bg={enabled ? "success" : "secondary"}
              className={`fw-normal${enabled ? "" : " opacity-50"}`}
              title={enabled ? "Enabled" : "Not included"}
            >
              {g.label}
            </Badge>
          );
        })}
      </div>
    </section>
  );
}
