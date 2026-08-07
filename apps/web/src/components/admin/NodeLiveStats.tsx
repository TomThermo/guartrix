import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminNodeStatusResponse } from "@msm/shared";
import { Alert, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { formatGb } from "../../utils";
import {
  CHART_HISTORY_MS,
  MatrixChart,
  type ChartSample,
} from "../ResourceHistoryCharts";
import { formatUptime } from "../status-line/status-line-utils";

const POLL_MS = 5_000;
const STORAGE_KEY = (id: string) => `guartrix-node-stats:${id}`;

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

function pruneSamples(samples: ChartSample[]): ChartSample[] {
  const cutoff = Date.now() - CHART_HISTORY_MS;
  return samples.filter((s) => s.at >= cutoff);
}

function loadSamples(nodeId: string): ChartSample[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(nodeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChartSample[];
    if (!Array.isArray(parsed)) return [];
    return pruneSamples(parsed);
  } catch {
    return [];
  }
}

function saveSamples(nodeId: string, samples: ChartSample[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY(nodeId), JSON.stringify(pruneSamples(samples)));
  } catch {
    // ignore quota
  }
}

function networkRatePoints(
  samples: ChartSample[],
  key: "networkRxBytes" | "networkTxBytes",
): Array<{ at: number; value: number }> {
  const out: Array<{ at: number; value: number }> = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    const a = prev[key];
    const b = cur[key];
    if (a == null || b == null) continue;
    const dt = (cur.at - prev.at) / 1000;
    if (dt <= 0) continue;
    const delta = b - a;
    if (delta < 0) continue;
    out.push({ at: cur.at, value: delta / dt / 1024 });
  }
  return out;
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
  const [samples, setSamples] = useState<ChartSample[]>(() => loadSamples(nodeId));

  useEffect(() => {
    setSamples(loadSamples(nodeId));
  }, [nodeId]);

  const pushSample = useCallback(
    (next: AdminNodeStatusResponse) => {
      const daemon = next.daemon;
      if (!daemon) return;
      const usedMb = Math.max(0, daemon.totalMemoryMb - daemon.freeMemoryMb);
      const cpuCap = Math.max(1, daemon.cpuCount) * 100;
      const cpuAbs = Math.max(0, daemon.loadAvg[0] * 100);
      const cpuPctOfCap = Math.min(100, (cpuAbs / cpuCap) * 100);
      const sample: ChartSample = {
        at: Date.now(),
        cpuPercent: cpuPctOfCap,
        memoryMb: usedMb,
        networkRxBytes: daemon.network?.rxBytes ?? 0,
        networkTxBytes: daemon.network?.txBytes ?? 0,
      };
      setSamples((prev) => {
        const merged = pruneSamples([...prev, sample]);
        saveSamples(nodeId, merged);
        return merged;
      });
    },
    [nodeId],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await api.getAdminNodeStatus(nodeId);
      setData(next);
      setError(next.reachable ? null : next.error ?? t("admin.nodeLiveUnreachable"));
      if (next.reachable && next.daemon) pushSample(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeId, pushSample, t]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [active, refresh]);

  const daemon = data?.daemon;
  const cpuCap = daemon ? Math.max(1, daemon.cpuCount) * 100 : 100;
  const cpuAbs = daemon ? Math.max(0, daemon.loadAvg[0] * 100) : 0;
  const usedMb = daemon
    ? Math.max(0, daemon.totalMemoryMb - daemon.freeMemoryMb)
    : 0;
  const memMax = Math.max(daemon?.totalMemoryMb ?? 1, usedMb, 1);

  const cpuPoints = useMemo(
    () => samples.map((s) => ({ at: s.at, value: s.cpuPercent })),
    [samples],
  );
  const memPoints = useMemo(
    () => samples.map((s) => ({ at: s.at, value: s.memoryMb })),
    [samples],
  );
  const rxPoints = useMemo(
    () => networkRatePoints(samples, "networkRxBytes"),
    [samples],
  );
  const txPoints = useMemo(
    () => networkRatePoints(samples, "networkTxBytes"),
    [samples],
  );
  const netMax = Math.max(
    1,
    ...rxPoints.map((p) => p.value),
    ...txPoints.map((p) => p.value),
  );
  const formatMem = (v: number) =>
    memMax >= 1024
      ? `${(v / 1024).toFixed(v % 1024 === 0 ? 0 : 1)}G`
      : `${Math.round(v)}`;
  const formatNet = (v: number) =>
    v >= 1024 ? `${(v / 1024).toFixed(1)}` : `${Math.round(v)}`;
  const chartId = `node_chart_${nodeId}`;

  if (!active) return null;

  if (loading && !data) {
    return (
      <div className="text-secondary small py-2">
        <Spinner size="sm" className="me-2" />
        {t("admin.nodeLiveLoading")}
      </div>
    );
  }

  if (error && !daemon) {
    return (
      <Alert variant="warning" className="py-2 small mb-0">
        {error}
      </Alert>
    );
  }

  if (!daemon) return null;

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
        {daemon.network && (
          <>
            <dt>{t("admin.nodeNetIn")}</dt>
            <dd>{daemon.network.rxLabel}</dd>
            <dt>{t("admin.nodeNetOut")}</dt>
            <dd>{daemon.network.txLabel}</dd>
          </>
        )}
      </dl>

      <section className="console-metrics node-live-metrics mb-3" aria-label={t("admin.nodeLiveCharts")}>
        <div className="console-metrics__head">
          <h3 className="console-metrics__title">{t("admin.nodeLiveCharts")}</h3>
          <span className="console-metrics__hint">{t("admin.nodeLiveChartsHint")}</span>
        </div>
        <div className="console-metrics-grid">
          <article className="chart-matrix-card">
            <MatrixChart
              title={t("admin.nodeCpu")}
              points={cpuPoints}
              max={100}
              unit="%"
              color="#5dba6a"
              fillId={`${chartId}-cpu`}
              yTicks={[0, 25, 50, 75, 100]}
              formatY={(v) => `${Math.round(v)}`}
              formatLatest={() =>
                `${cpuAbs.toFixed(1)}% ${t("admin.nodeOf")} ${cpuCap}%`
              }
              tall
            />
          </article>
          <article className="chart-matrix-card">
            <MatrixChart
              title={t("admin.nodeMemoryLive")}
              points={memPoints}
              max={memMax}
              unit=" MB"
              color="#6b9e8a"
              fillId={`${chartId}-mem`}
              yTicks={[0, memMax * 0.25, memMax * 0.5, memMax * 0.75, memMax]}
              formatY={formatMem}
              formatLatest={() =>
                `${formatGb(usedMb)} ${t("admin.nodeOf")} ${formatGb(daemon.totalMemoryMb)}`
              }
              tall
            />
          </article>
          <article className="chart-matrix-card">
            <MatrixChart
              title={t("admin.nodeNetIn")}
              points={rxPoints}
              max={netMax}
              unit={netMax >= 1024 ? " MiB/s" : " KiB/s"}
              color="#6a9ed4"
              fillId={`${chartId}-rx`}
              formatY={formatNet}
              tall
            />
          </article>
          <article className="chart-matrix-card">
            <MatrixChart
              title={t("admin.nodeNetOut")}
              points={txPoints}
              max={netMax}
              unit={netMax >= 1024 ? " MiB/s" : " KiB/s"}
              color="#c9a066"
              fillId={`${chartId}-tx`}
              formatY={formatNet}
              tall
            />
          </article>
        </div>
      </section>

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
