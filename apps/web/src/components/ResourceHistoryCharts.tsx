import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

export interface ChartSample {
  at: number;
  cpuPercent: number;
  memoryMb: number;
  /** Cumulative container RX bytes (Docker). */
  networkRxBytes?: number;
  /** Cumulative container TX bytes (Docker). */
  networkTxBytes?: number;
}

export const CHART_HISTORY_MS = 60 * 60 * 1000; // 1 hour

interface MatrixChartProps {
  title: string;
  /** Timed samples for a fixed window (oldest → newest). */
  points: Array<{ at: number; value: number }>;
  max: number;
  unit: string;
  color: string;
  fillId: string;
  /** Fixed Y-axis ticks (e.g. CPU 0–100). Defaults to 0/25/50/75/max. */
  yTicks?: number[];
  formatY?: (v: number) => string;
  formatLatest?: (v: number) => string;
  windowMs?: number;
  tall?: boolean;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function defaultYTicks(max: number): number[] {
  if (max === 100) return [0, 25, 50, 75, 100];
  const step = max / 4;
  return [0, step, step * 2, step * 3, max];
}

function interpolateAt(
  points: Array<{ at: number; value: number }>,
  at: number,
): number {
  if (points.length === 0) return 0;
  if (at <= points[0]!.at) return points[0]!.value;
  const last = points[points.length - 1]!;
  if (at >= last.at) return last.value;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    if (at >= prev.at && at <= cur.at) {
      const t = (at - prev.at) / (cur.at - prev.at);
      return prev.value + t * (cur.value - prev.value);
    }
  }
  return last.value;
}

/** Area chart with left value axis (0…max) and bottom 1h time axis. */
export function MatrixChart({
  title,
  points,
  max,
  unit,
  color,
  fillId,
  yTicks,
  formatY,
  formatLatest,
  windowMs = CHART_HISTORY_MS,
  tall = false,
}: MatrixChartProps) {
  const width = 560;
  const height = tall ? 200 : 140;
  const padL = 44;
  const padR = 12;
  const padT = 10;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const safeMax = Math.max(max, 1);
  const now = Date.now();
  const windowStart = now - windowMs;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    at: number;
    value: number;
    pctX: number;
  } | null>(null);

  const ticks = yTicks ?? defaultYTicks(safeMax);
  const fmtY = formatY ?? ((v: number) => `${Math.round(v)}`);
  const fmtLatest = formatLatest ?? ((v: number) => `${Math.round(v)}${unit}`);

  const inWindow = points.filter((p) => p.at >= windowStart && p.at <= now);

  const toXY = useCallback(
    (at: number, value: number) => {
      const x = padL + ((at - windowStart) / windowMs) * plotW;
      const y = padT + plotH - (Math.min(Math.max(value, 0), safeMax) / safeMax) * plotH;
      return { x, y };
    },
    [plotH, plotW, safeMax, windowMs, windowStart],
  );

  const coords = inWindow.map((p) => toXY(p.at, p.value));
  const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(" ");

  let area = "";
  if (coords.length > 0) {
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    const line = coords.map((c) => `${c.x},${c.y}`).join(" L ");
    area = `M ${first.x},${padT + plotH} L ${line} L ${last.x},${padT + plotH} Z`;
  }

  const latestRaw = inWindow.length ? inWindow[inWindow.length - 1]!.value : 0;
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    x: padL + p * plotW,
    label: formatClock(windowStart + p * windowMs).slice(0, 5),
  }));

  const updateHover = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || inWindow.length === 0) {
        setHover(null);
        return;
      }
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = 0;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const x = svgPt.x;
      if (x < padL || x > padL + plotW) {
        setHover(null);
        return;
      }
      const at = windowStart + ((x - padL) / plotW) * windowMs;
      const value = interpolateAt(inWindow, at);
      const { x: snapX, y } = toXY(at, value);
      setHover({
        x: snapX,
        y,
        at,
        value,
        pctX: (snapX / width) * 100,
      });
    },
    [inWindow, plotW, toXY, windowMs, windowStart],
  );

  const onSvgMove = (e: MouseEvent<SVGSVGElement>) => {
    updateHover(e.clientX);
  };

  const onSvgLeave = () => setHover(null);

  return (
    <div className={`chart-matrix ${tall ? "chart-matrix-tall" : ""}`}>
      <div className="chart-matrix-head">
        <span className="chart-matrix-title">{title}</span>
        <strong style={{ color } as CSSProperties}>{fmtLatest(latestRaw)}</strong>
      </div>
      <div className="chart-matrix-body">
        <svg
          ref={svgRef}
          className="chart-matrix-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${title} history, last hour`}
          onMouseMove={onSvgMove}
          onMouseLeave={onSvgLeave}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.45" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
            <clipPath id={`${fillId}-clip`}>
              <rect x={padL} y={padT} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="rgba(12, 18, 14, 0.35)"
            stroke="rgba(143, 163, 150, 0.28)"
            strokeWidth="1"
          />

          {ticks.map((tick) => {
            const y = padT + plotH - (tick / safeMax) * plotH;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={y}
                  y2={y}
                  stroke="rgba(143, 163, 150, 0.18)"
                  strokeWidth="1"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(143, 163, 150, 0.9)"
                  fontSize="10"
                >
                  {fmtY(tick)}
                </text>
              </g>
            );
          })}

          {timeTicks.map((t) => (
            <g key={`t-${t.label}-${t.x}`}>
              <line
                x1={t.x}
                x2={t.x}
                y1={padT}
                y2={padT + plotH}
                stroke="rgba(143, 163, 150, 0.12)"
                strokeWidth="1"
              />
              <text
                x={t.x}
                y={height - 8}
                textAnchor="middle"
                fill="rgba(143, 163, 150, 0.85)"
                fontSize="10"
              >
                {t.label}
              </text>
            </g>
          ))}

          <g clipPath={`url(#${fillId}-clip)`}>
            {coords.length > 1 && (
              <>
                <path d={area} fill={`url(#${fillId})`} />
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={polyPoints}
                />
              </>
            )}
          </g>

          {hover && (
            <g className="chart-matrix-hover" pointerEvents="none">
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padT}
                y2={padT + plotH}
                stroke={color}
                strokeWidth="1"
                strokeOpacity="0.65"
                strokeDasharray="3 3"
              />
              <circle cx={hover.x} cy={hover.y} r="4" fill={color} stroke="#0c1210" strokeWidth="1.5" />
            </g>
          )}

          {coords.length <= 1 && (
            <text
              x={padL + plotW / 2}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="rgba(143, 163, 150, 0.8)"
              fontSize="12"
            >
              Collecting… (1h history)
            </text>
          )}

          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="transparent"
            style={{ cursor: inWindow.length > 1 ? "crosshair" : "default" }}
          />
        </svg>

        {hover && (
          <div
            className="chart-matrix-tooltip"
            style={
              {
                left: `${hover.pctX}%`,
                "--chart-accent": color,
              } as CSSProperties
            }
          >
            <span className="chart-matrix-tooltip__time">{formatClock(hover.at)}</span>
            <strong className="chart-matrix-tooltip__value">
              {fmtY(hover.value)}
              {unit}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}
