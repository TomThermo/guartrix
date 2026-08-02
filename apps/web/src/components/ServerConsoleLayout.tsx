import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectInfo,
  McServer,
  ServerStats,
  ServerStatus,
  SystemInfo,
} from "@msm/shared";
import { Button, Col, Row } from "react-bootstrap";
import { api } from "../api";
import { Console } from "./Console";
import { ConsoleOnlineHeads } from "./ConsoleOnlineHeads";
import {
  CHART_HISTORY_MS,
  MatrixChart,
  type ChartSample,
} from "./ResourceHistoryCharts";
import { ServerInfoPanel } from "./ServerInfoPanel";

interface Props {
  server: McServer;
  connect: ConnectInfo | null;
  system: SystemInfo | null;
  canStart?: boolean;
  canStop?: boolean;
  canKill?: boolean;
  canRestart?: boolean;
  /** @deprecated use canStart/canStop/canRestart */
  canWrite?: boolean;
  canSendConsole?: boolean;
  /** View online heads bar (player.read). */
  canViewPlayers?: boolean;
  canManagePlayers?: boolean;
  busy: boolean;
  onStatus: (status: ServerStatus) => void;
  onStart: () => void;
  onStop: () => void;
  onKill?: () => void;
  onRestart: () => void;
  onError?: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  /** Panel messages shown in the console (e.g. license blocked). */
  consoleNotices?: string[];
}

const SAMPLE_INTERVAL_MS = 15_000;
const STORAGE_KEY = (id: string) => `guartrix-stats-history:${id}`;

function loadSamples(serverId: string): ChartSample[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(serverId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChartSample[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - CHART_HISTORY_MS;
    return parsed.filter(
      (s) =>
        typeof s?.at === "number" &&
        typeof s.cpuPercent === "number" &&
        typeof s.memoryMb === "number" &&
        s.at >= cutoff,
    );
  } catch {
    return [];
  }
}

function saveSamples(serverId: string, samples: ChartSample[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY(serverId), JSON.stringify(samples));
  } catch {
    // ignore quota
  }
}

function pruneToHour(samples: ChartSample[]): ChartSample[] {
  const cutoff = Date.now() - CHART_HISTORY_MS;
  return samples.filter((s) => s.at >= cutoff);
}

function mergeSamples(a: ChartSample[], b: ChartSample[]): ChartSample[] {
  const byAt = new Map<number, ChartSample>();
  for (const s of [...a, ...b]) byAt.set(s.at, s);
  return pruneToHour([...byAt.values()].sort((x, y) => x.at - y.at));
}

/** Convert cumulative byte counters into per-sample KB/s using adjacent points. */
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
    if (delta < 0) continue; // counter reset
    out.push({ at: cur.at, value: delta / dt / 1024 }); // KiB/s
  }
  return out;
}

export function ServerConsoleLayout({
  server,
  connect,
  system,
  canStart,
  canStop,
  canKill,
  canRestart,
  canWrite,
  canSendConsole = true,
  canViewPlayers = true,
  canManagePlayers = true,
  busy,
  onStatus,
  onStart,
  onStop,
  onKill,
  onRestart,
  onError,
  onNotice,
  consoleNotices = [],
}: Props) {
  const allowStart = canStart ?? canWrite ?? false;
  const allowStop = canStop ?? canWrite ?? false;
  const allowKill = canKill ?? false;
  const allowRestart = canRestart ?? canWrite ?? false;
  const showControls = allowStart || allowStop || allowKill || allowRestart;
  const serverActive = server.status === "RUNNING" || server.status === "STARTING";
  const isStopped = server.status === "STOPPED";
  const [samples, setSamples] = useState<ChartSample[]>(() => loadSamples(server.id));
  const samplesRef = useRef<ChartSample[]>(samples);
  const [liveStats, setLiveStats] = useState<ServerStats | null>(null);
  const liveStatsRef = useRef(liveStats);
  liveStatsRef.current = liveStats;
  const lastSampleAt = useRef(0);

  const pushSample = useCallback((nextStats: ServerStats) => {
    const now = Date.now();
    if (now - lastSampleAt.current < 900) {
      setLiveStats(nextStats);
      return;
    }
    lastSampleAt.current = now;
    setLiveStats(nextStats);
    const sample: ChartSample = {
      at: now,
      cpuPercent: nextStats.running ? nextStats.cpuPercent : 0,
      memoryMb: nextStats.running
        ? Math.round(nextStats.memoryUsedBytes / (1024 * 1024))
        : 0,
      networkRxBytes: nextStats.networkRxBytes ?? 0,
      networkTxBytes: nextStats.networkTxBytes ?? 0,
    };
    const next = pruneToHour([...samplesRef.current, sample]);
    samplesRef.current = next;
    setSamples(next);
    saveSamples(server.id, next);
  }, [server.id]);

  useEffect(() => {
    let cancelled = false;
    const loaded = loadSamples(server.id);
    samplesRef.current = loaded;
    setSamples(loaded);
    setLiveStats(null);
    lastSampleAt.current = 0;

    void api
      .getStatsHistory(server.id)
      .then((res) => {
        if (cancelled) return;
        const remote: ChartSample[] = (res.samples ?? []).map((s) => ({
          at: s.at,
          cpuPercent: s.cpuPercent,
          memoryMb: s.memoryMb,
          networkRxBytes: s.networkRxBytes,
          networkTxBytes: s.networkTxBytes,
        }));
        const merged = mergeSamples(samplesRef.current, remote);
        samplesRef.current = merged;
        setSamples(merged);
        saveSamples(server.id, merged);
      })
      .catch(() => undefined);

    const tick = async () => {
      // Prefer console WS stats; only HTTP-poll as a slow fallback.
      if (liveStatsRef.current) return;
      try {
        const nextStats = await api.getStats(server.id).catch(() => null);
        if (cancelled || !nextStats) return;
        pushSample(nextStats);
      } catch {
        // ignore
      }
    };
    void tick();
    const t = setInterval(() => void tick(), SAMPLE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [server.id, pushSample]);

  const memMax = Math.max(server.memoryMb, ...samples.map((s) => s.memoryMb), 1);
  const chartId = `chart_memory_${server.id}`;
  const cpuPoints = samples.map((s) => ({ at: s.at, value: s.cpuPercent }));
  const memPoints = samples.map((s) => ({ at: s.at, value: s.memoryMb }));
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
    memMax >= 1024 ? `${(v / 1024).toFixed(v % 1024 === 0 ? 0 : 1)}G` : `${Math.round(v)}`;
  const formatNet = (v: number) =>
    v >= 1024 ? `${(v / 1024).toFixed(1)}` : `${Math.round(v)}`;

  return (
    <Row className="g-3 console-layout">
      <Col xs={12} lg={8}>
        <div className="console-with-online">
          {canViewPlayers && (
            <ConsoleOnlineHeads
              serverId={server.id}
              active={serverActive}
              canUpdate={canManagePlayers}
              onError={onError}
              onNotice={onNotice}
            />
          )}
          <Console
            serverId={server.id}
            onStatus={onStatus}
            onStats={pushSample}
            canSend={canSendConsole}
            panelNotices={consoleNotices}
          />
        </div>
      </Col>
      <Col xs={12} lg={4}>
        <div className="d-flex flex-column gap-3 h-100">
          {showControls && (
            <div className="server-controls-panel">
              <div className="server-controls-title">
                <i className="fa-solid fa-gamepad" />
                Controls
              </div>
              <div className="server-controls-actions">
                {allowStart && (
                  <Button
                    size="sm"
                    variant="success"
                    disabled={busy || server.status === "RUNNING" || server.status === "STARTING"}
                    onClick={onStart}
                  >
                    <i className="fa-solid fa-play me-1" />
                    Start
                  </Button>
                )}
                {allowStop && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="server-control-stop"
                    disabled={busy || isStopped}
                    onClick={onStop}
                  >
                    <i className="fa-solid fa-stop me-1" />
                    Stop
                  </Button>
                )}
                {allowKill && (
                  <Button
                    size="sm"
                    variant="warning"
                    className="server-control-kill"
                    disabled={busy || isStopped}
                    title="Force-kill server"
                    onClick={() => onKill?.()}
                  >
                    <i className="fa-solid fa-skull-crossbones me-1" />
                    Kill
                  </Button>
                )}
                {allowRestart && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="server-control-restart"
                    disabled={busy}
                    onClick={onRestart}
                  >
                    <i className="fa-solid fa-rotate-right me-1" />
                    Restart
                  </Button>
                )}
              </div>
            </div>
          )}
          <ServerInfoPanel
            server={server}
            connect={connect}
            system={system}
            liveStats={liveStats}
          />
        </div>
      </Col>
      <Col xs={12} md={6}>
        <div className="chart-matrix-card">
          <MatrixChart
            title="RAM"
            points={memPoints}
            max={memMax}
            unit=" MB"
            color="#6b9e8a"
            fillId={`${chartId}-mem`}
            yTicks={[0, memMax * 0.25, memMax * 0.5, memMax * 0.75, memMax]}
            formatY={formatMem}
            tall
          />
        </div>
      </Col>
      <Col xs={12} md={6}>
        <div className="chart-matrix-card">
          <MatrixChart
            title="CPU"
            points={cpuPoints}
            max={100}
            unit="%"
            color="#5dba6a"
            fillId={`${chartId}-cpu`}
            yTicks={[0, 25, 50, 75, 100]}
            formatY={(v) => `${Math.round(v)}`}
            tall
          />
        </div>
      </Col>
      <Col xs={12} md={6}>
        <div className="chart-matrix-card">
          <MatrixChart
            title="Net ↓"
            points={rxPoints}
            max={netMax}
            unit={netMax >= 1024 ? " MiB/s" : " KiB/s"}
            color="#6a9ed4"
            fillId={`${chartId}-rx`}
            formatY={formatNet}
            tall
          />
        </div>
      </Col>
      <Col xs={12} md={6}>
        <div className="chart-matrix-card">
          <MatrixChart
            title="Net ↑"
            points={txPoints}
            max={netMax}
            unit={netMax >= 1024 ? " MiB/s" : " KiB/s"}
            color="#c9a066"
            fillId={`${chartId}-tx`}
            formatY={formatNet}
            tall
          />
        </div>
      </Col>
    </Row>
  );
}
