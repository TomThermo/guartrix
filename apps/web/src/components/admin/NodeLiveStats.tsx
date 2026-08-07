import { useCallback, useEffect, useState } from "react";
import type { AdminNodeStatusResponse } from "@msm/shared";
import { Alert, ProgressBar, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { formatGb } from "../../utils";
import { formatUptime, percentVariant } from "../status-line/status-line-utils";

const POLL_MS = 5_000;

function DiskPie({
  usedPercent,
  usedLabel,
  freeLabel,
  totalLabel,
}: {
  usedPercent: number;
  usedLabel: string;
  freeLabel: string;
  totalLabel: string;
}) {
  const { t } = useI18n();
  const pct = Math.max(0, Math.min(100, usedPercent));
  const r = 36;
  const c = 2 * Math.PI * r;
  const usedLen = (pct / 100) * c;
  const freeLen = c - usedLen;
  const color =
    pct >= 90 ? "var(--bs-danger)" : pct >= 70 ? "var(--bs-warning)" : "var(--bh-accent, #5dba6a)";

  return (
    <div className="node-disk-pie d-flex align-items-center gap-3 flex-wrap">
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        className="node-disk-pie__svg flex-shrink-0"
        aria-hidden
      >
        <g transform="rotate(-90 48 48)">
          <circle
            cx="48"
            cy="48"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
          />
          <circle
            cx="48"
            cy="48"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${usedLen} ${freeLen}`}
            strokeLinecap="butt"
          />
        </g>
        <text
          x="48"
          y="48"
          textAnchor="middle"
          dominantBaseline="central"
          className="node-disk-pie__pct"
          fill="currentColor"
          fontSize="14"
          fontWeight="700"
        >
          {pct.toFixed(0)}%
        </text>
      </svg>
      <div className="small min-w-0">
        <div className="fw-semibold mb-1">{t("admin.nodeStorage")}</div>
        <div className="d-flex align-items-center gap-2 mb-1">
          <span
            className="rounded-circle d-inline-block"
            style={{ width: 8, height: 8, background: color }}
          />
          <span>
            {t("admin.nodeDiskUsed")}: {usedLabel}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2 mb-1 text-secondary">
          <span
            className="rounded-circle d-inline-block"
            style={{ width: 8, height: 8, background: "rgba(255,255,255,0.2)" }}
          />
          <span>
            {t("admin.nodeDiskFree")}: {freeLabel}
          </span>
        </div>
        <div className="text-secondary">
          {t("admin.nodeDiskTotal")}: {totalLabel}
        </div>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  detail,
  percent,
}: {
  label: string;
  detail: string;
  percent: number;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1">
        <span className="small fw-semibold">{label}</span>
        <span className="small text-secondary text-end">{detail}</span>
      </div>
      <ProgressBar
        now={pct}
        variant={percentVariant(pct)}
        style={{ height: "0.45rem" }}
        title={`${pct.toFixed(1)}%`}
      />
    </div>
  );
}

export function NodeLiveStats({
  nodeId,
  active,
}: {
  nodeId: string;
  /** Poll only while Overview tab is visible. */
  active: boolean;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<AdminNodeStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getAdminNodeStatus(nodeId);
      setData(next);
      setError(next.reachable ? null : next.error ?? t("admin.nodeLiveUnreachable"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeId, t]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [active, refresh]);

  if (!active) return null;

  if (loading && !data) {
    return (
      <div className="text-secondary small py-2">
        <Spinner size="sm" className="me-2" />
        {t("admin.nodeLiveLoading")}
      </div>
    );
  }

  if (error && !data?.daemon) {
    return (
      <Alert variant="warning" className="py-2 small mb-0">
        {error}
      </Alert>
    );
  }

  const daemon = data?.daemon;
  if (!daemon) return null;

  const usedMb = Math.max(0, daemon.totalMemoryMb - daemon.freeMemoryMb);
  const memPct =
    daemon.totalMemoryMb > 0 ? (usedMb / daemon.totalMemoryMb) * 100 : 0;
  /** Absolute host CPU like Pelican: load1 × 100 of (cores × 100). */
  const cpuAbs = Math.max(0, daemon.loadAvg[0] * 100);
  const cpuCap = Math.max(1, daemon.cpuCount) * 100;
  const cpuPctOfCap = Math.min(100, (cpuAbs / cpuCap) * 100);

  return (
    <div className="node-live-stats">
      {error && (
        <Alert variant="warning" className="py-2 small mb-3">
          {error}
        </Alert>
      )}

      <dl className="admin-kv mb-3">
        <dt>{t("admin.nodeDaemonVersion")}</dt>
        <dd className="font-monospace">{daemon.daemonVersion}</dd>
        <dt>{t("admin.nodeCpuThreads")}</dt>
        <dd>{daemon.cpuCount}</dd>
        <dt>{t("admin.nodeArch")}</dt>
        <dd className="font-monospace">{daemon.arch}</dd>
        <dt>{t("admin.nodeKernel")}</dt>
        <dd className="font-monospace small">{daemon.osVersion}</dd>
        <dt>{t("admin.nodeHostname")}</dt>
        <dd className="text-truncate">{daemon.hostname}</dd>
        <dt>{t("admin.nodeUptime")}</dt>
        <dd>{formatUptime(daemon.uptime)}</dd>
      </dl>

      <UsageBar
        label={t("admin.nodeCpu")}
        detail={`${cpuAbs.toFixed(1)}% ${t("admin.nodeOf")} ${cpuCap}%`}
        percent={cpuPctOfCap}
      />
      <UsageBar
        label={t("admin.nodeMemoryLive")}
        detail={`${formatGb(usedMb)} ${t("admin.nodeOf")} ${formatGb(daemon.totalMemoryMb)}`}
        percent={memPct}
      />

      {daemon.disk ? (
        <DiskPie
          usedPercent={daemon.disk.usedPercent}
          usedLabel={daemon.disk.usedLabel}
          freeLabel={daemon.disk.freeLabel}
          totalLabel={daemon.disk.totalLabel}
        />
      ) : (
        <p className="small text-secondary mb-0">{t("admin.nodeDiskUnknown")}</p>
      )}

      <div className="small text-secondary mt-3">
        {t("admin.nodeLiveRefresh", {
          at: data?.generatedAt
            ? new Date(data.generatedAt).toLocaleTimeString()
            : "—",
        })}
      </div>
    </div>
  );
}
