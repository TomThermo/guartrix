import { useMemo, useState } from "react";
import type { DiskUsageBreakdown } from "@msm/shared";
import { Card, Col, Row } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { formatBytes, formatGb } from "../utils";

interface Props {
  disk: DiskUsageBreakdown;
  limitMb?: number;
  /** Tighter spacing for embedding above the file toolbar. */
  compact?: boolean;
  className?: string;
}

type DiskPartKey = "world" | "mods" | "backups" | "other";

/**
 * Shared disk usage card: used / quota · free remaining + World / mods / backups / other.
 * Quota compares data bytes excluding backups (same rule as the API disk quota).
 */
export function DiskUsageCard({
  disk,
  limitMb,
  compact = false,
  className,
}: Props) {
  const { t } = useI18n();
  const [hoverKey, setHoverKey] = useState<DiskPartKey | null>(null);
  const total = Math.max(disk.totalBytes, 1);
  const limitBytes =
    limitMb && limitMb > 0 ? limitMb * 1024 * 1024 : null;
  const usedData = Math.max(0, disk.totalBytes - disk.backupsBytes);
  const over = limitBytes != null ? usedData >= limitBytes : false;
  const freeBytes =
    limitBytes != null ? Math.max(0, limitBytes - usedData) : null;
  const limitLabel =
    limitMb && limitMb > 0 ? formatGb(limitMb) : null;

  const parts = useMemo(
    () =>
      [
        {
          key: "world" as const,
          label: t("resources.world"),
          bytes: disk.worldBytes,
          display: disk.worldLabel,
        },
        {
          key: "mods" as const,
          label: t("resources.modsPlugins"),
          bytes: disk.modsPluginsBytes,
          display: disk.modsPluginsLabel,
        },
        {
          key: "backups" as const,
          label: t("resources.backups"),
          bytes: disk.backupsBytes,
          display: disk.backupsLabel,
        },
        {
          key: "other" as const,
          label: t("resources.other"),
          bytes: disk.otherBytes,
          display: disk.otherLabel,
        },
      ],
    [disk, t],
  );

  function keyAtBarX(clientX: number, target: HTMLElement): DiskPartKey | null {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    let acc = 0;
    for (const p of parts) {
      const frac = p.bytes / total;
      if (ratio < acc + frac || p === parts[parts.length - 1]) {
        return p.key;
      }
      acc += frac;
    }
    return null;
  }

  return (
    <Card
      className={`disk-usage-card ${compact ? "mb-2" : "mb-3"}${className ? ` ${className}` : ""}`}
    >
      <Card.Body className={compact ? "py-2 px-3" : undefined}>
        <div className="d-flex justify-content-between align-items-baseline mb-2 flex-wrap gap-1">
          <div className="text-muted small">{t("resources.diskUsage")}</div>
          <strong className={over ? "text-danger" : undefined}>
            {disk.totalLabel}
            {limitLabel ? (
              <span className="text-muted fw-normal"> / {limitLabel}</span>
            ) : null}
            {freeBytes != null ? (
              <span className="text-muted fw-normal">
                {" "}
                · {t("resources.freeRemaining", { amount: formatBytes(freeBytes) })}
              </span>
            ) : null}
          </strong>
        </div>
        {over && (
          <div className="text-danger small mb-2">
            {t("resources.quotaReached")}
          </div>
        )}
        <div
          className={`disk-usage-bar ${compact ? "mb-2" : "mb-3"}`}
          role="img"
          aria-label={t("resources.breakdownAria")}
          onMouseMove={(e) =>
            setHoverKey(keyAtBarX(e.clientX, e.currentTarget))
          }
          onMouseLeave={() => setHoverKey(null)}
        >
          {parts.map((p) => {
            const pct = (p.bytes / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={p.key}
                className={`disk-usage-seg disk-usage-seg-${p.key}${
                  hoverKey === p.key ? " is-hovered" : ""
                }${hoverKey && hoverKey !== p.key ? " is-dimmed" : ""}`}
                style={{ width: `${pct}%` }}
                title={`${p.label}: ${p.display}`}
              />
            );
          })}
        </div>
        <Row xs={2} md={4} className="g-2 small">
          {parts.map((p) => (
            <Col key={p.key}>
              <div
                className={`disk-usage-legend disk-usage-legend-${p.key}${
                  hoverKey === p.key ? " is-highlighted" : ""
                }${hoverKey && hoverKey !== p.key ? " is-dimmed" : ""}`}
                onMouseEnter={() => setHoverKey(p.key)}
                onMouseLeave={() => setHoverKey(null)}
              >
                <div className="disk-usage-legend-label">
                  <span
                    className={`disk-usage-swatch disk-usage-swatch-${p.key}`}
                    aria-hidden
                  />
                  {p.label}
                </div>
                <div className="disk-usage-legend-value">{p.display}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card.Body>
    </Card>
  );
}
