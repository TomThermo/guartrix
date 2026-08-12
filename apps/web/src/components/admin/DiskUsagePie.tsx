import { useI18n } from "../../i18n/react";

/** Donut chart for used / free / total disk (same look as node overview). */
export function DiskUsagePie({
  usedPercent,
  usedLabel,
  freeLabel,
  totalLabel,
  size = 176,
  centerLabel,
}: {
  usedPercent: number;
  usedLabel: string;
  freeLabel: string;
  totalLabel: string;
  size?: number;
  /** Defaults to admin.nodeStorage ("Storage"). */
  centerLabel?: string;
}) {
  const { t } = useI18n();
  const pct = Math.max(0, Math.min(100, usedPercent));
  const r = size * 0.38;
  const stroke = Math.max(14, size * 0.09);
  const c = 2 * Math.PI * r;
  const usedLen = (pct / 100) * c;
  const freeLen = c - usedLen;
  const color =
    pct >= 90 ? "var(--bs-danger)" : pct >= 70 ? "var(--bs-warning)" : "var(--bh-accent)";
  const mid = size / 2;

  return (
    <div className="node-disk-hero">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="node-disk-hero__svg"
        aria-hidden
      >
        <g transform={`rotate(-90 ${mid} ${mid})`}>
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
          />
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${usedLen} ${freeLen}`}
            strokeLinecap="butt"
          />
        </g>
        <text
          x={mid}
          y={mid - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          fontSize={size * 0.16}
          fontWeight="700"
        >
          {pct.toFixed(0)}%
        </text>
        <text
          x={mid}
          y={mid + size * 0.12}
          textAnchor="middle"
          fill="rgba(143, 163, 150, 0.95)"
          fontSize={size * 0.065}
          fontWeight="600"
        >
          {centerLabel ?? t("admin.nodeStorage")}
        </text>
      </svg>
      <div className="node-disk-hero__legend">
        <div className="node-disk-hero__row">
          <span className="node-disk-hero__dot" style={{ background: color }} />
          <span>
            {t("admin.nodeDiskUsed")}: <strong>{usedLabel}</strong>
          </span>
        </div>
        <div className="node-disk-hero__row text-secondary">
          <span className="node-disk-hero__dot" style={{ background: "rgba(255,255,255,0.22)" }} />
          <span>
            {t("admin.nodeDiskFree")}: {freeLabel}
          </span>
        </div>
        <div className="node-disk-hero__row text-secondary">
          <span className="node-disk-hero__dot node-disk-hero__dot--empty" />
          <span>
            {t("admin.nodeDiskTotal")}: {totalLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
