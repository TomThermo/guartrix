import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminNodeStatusResponse } from "@guartrix/shared";
import { Alert, Spinner } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { formatGb } from "../../utils";
import { CHART_HISTORY_MS, MatrixChart, type ChartSample } from "../ResourceHistoryCharts";
import { formatUptime } from "../status-line/status-line-utils";
import { readCssAccent } from "../../palettes";

const POLL_MS = 5_000;
const STORAGE_KEY = (id: string) => `guartrix-node-stats:${id}`;

function DiskPie({
  usedPercent,
  usedLabel,
  freeLabel,
  totalLabel,
  size = 176,
}: {
  usedPercent: number;
  usedLabel: string;
  freeLabel: string;
  totalLabel: string;
  size?: number;
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
          {t("admin.nodeStorage")}
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

function MetaTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="node-meta-tile">
      <div className="node-meta-tile__label">{label}</div>
      <div className={`node-meta-tile__value ${mono ? "font-monospace" : ""}`}>{value}</div>
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
      setError(next.reachable ? null : (next.error ?? t("admin.nodeLiveUnreachable")));
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
  const usedMb = daemon ? Math.max(0, daemon.totalMemoryMb - daemon.freeMemoryMb) : 0;
  const memMax = Math.max(daemon?.totalMemoryMb ?? 1, usedMb, 1);

  const cpuPoints = useMemo(
    () => samples.map((s) => ({ at: s.at, value: s.cpuPercent })),
    [samples],
  );
  const memPoints = useMemo(() => samples.map((s) => ({ at: s.at, value: s.memoryMb })), [samples]);
  const rxPoints = useMemo(() => networkRatePoints(samples, "networkRxBytes"), [samples]);
  const txPoints = useMemo(() => networkRatePoints(samples, "networkTxBytes"), [samples]);
  const netMax = Math.max(1, ...rxPoints.map((p) => p.value), ...txPoints.map((p) => p.value));
  const formatMem = (v: number) =>
    memMax >= 1024 ? `${(v / 1024).toFixed(v % 1024 === 0 ? 0 : 1)}G` : `${Math.round(v)}`;
  const formatNet = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(1)}` : `${Math.round(v)}`);
  const chartId = `node_chart_${nodeId}`;
  const latestRx = rxPoints.length ? rxPoints[rxPoints.length - 1]!.value : 0;
  const latestTx = txPoints.length ? txPoints[txPoints.length - 1]!.value : 0;

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

      <div className="node-live-dash">
        <div className="node-live-dash__side">
          <MetaTile label={t("admin.nodeDaemonVersion")} value={daemon.daemonVersion} mono />
          <MetaTile label={t("admin.nodeCpuThreads")} value={String(daemon.cpuCount)} />
          <MetaTile label={t("admin.nodeArch")} value={daemon.arch} mono />
          <MetaTile label={t("admin.nodeKernel")} value={daemon.osVersion} mono />
          <MetaTile label={t("admin.nodeHostname")} value={daemon.hostname} />
          <MetaTile label={t("admin.nodeUptime")} value={formatUptime(daemon.uptime)} />
        </div>

        <div className="node-live-dash__center">
          {daemon.disk ? (
            <DiskPie
              size={188}
              usedPercent={daemon.disk.usedPercent}
              usedLabel={daemon.disk.usedLabel}
              freeLabel={daemon.disk.freeLabel}
              totalLabel={daemon.disk.totalLabel}
            />
          ) : (
            <p className="small text-secondary mb-0 text-center">{t("admin.nodeDiskUnknown")}</p>
          )}
        </div>

        <div className="node-live-dash__side">
          <div className="node-stat-card">
            <div className="node-stat-card__label">{t("admin.nodeCpu")}</div>
            <div className="node-stat-card__value text-success">
              {cpuAbs.toFixed(0)}%
              <span className="node-stat-card__sub">
                {" "}
                {t("admin.nodeOf")} {cpuCap}%
              </span>
            </div>
          </div>
          <div className="node-stat-card">
            <div className="node-stat-card__label">{t("admin.nodeMemoryLive")}</div>
            <div className="node-stat-card__value">
              {formatGb(usedMb)}
              <span className="node-stat-card__sub">
                {" "}
                {t("admin.nodeOf")} {formatGb(daemon.totalMemoryMb)}
              </span>
            </div>
          </div>
          <div className="node-stat-card">
            <div className="node-stat-card__label">{t("admin.nodeNetIn")}</div>
            <div className="node-stat-card__value" style={{ color: "#6a9ed4" }}>
              {formatNet(latestRx)}
              <span className="node-stat-card__sub">{netMax >= 1024 ? " MiB/s" : " KiB/s"}</span>
            </div>
            <div className="node-stat-card__hint">{daemon.network?.rxLabel ?? "—"} total</div>
          </div>
          <div className="node-stat-card">
            <div className="node-stat-card__label">{t("admin.nodeNetOut")}</div>
            <div className="node-stat-card__value" style={{ color: "#c9a066" }}>
              {formatNet(latestTx)}
              <span className="node-stat-card__sub">{netMax >= 1024 ? " MiB/s" : " KiB/s"}</span>
            </div>
            <div className="node-stat-card__hint">{daemon.network?.txLabel ?? "—"} total</div>
          </div>
        </div>
      </div>

      <section
        className="console-metrics node-live-metrics mb-2"
        aria-label={t("admin.nodeLiveCharts")}
      >
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
              color={readCssAccent()}
              fillId={`${chartId}-cpu`}
              yTicks={[0, 25, 50, 75, 100]}
              formatY={(v) => `${Math.round(v)}`}
              formatLatest={() => `${cpuAbs.toFixed(1)}% ${t("admin.nodeOf")} ${cpuCap}%`}
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

      <div className="small text-secondary">
        {t("admin.nodeLiveRefresh", {
          at: data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : "—",
        })}
      </div>
    </div>
  );
}
