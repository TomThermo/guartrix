export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export function containerStateVariant(
  state: string,
): "success" | "danger" | "secondary" | "warning" {
  const s = state.toLowerCase();
  if (s === "running") return "success";
  if (s === "restarting") return "warning";
  if (s === "exited" || s === "dead") return "danger";
  return "secondary";
}

export function loadAvgVariant(load1: number, cpuCount: number): "success" | "warning" | "danger" {
  const ratio = cpuCount > 0 ? load1 / cpuCount : 0;
  if (ratio >= 1) return "danger";
  if (ratio >= 0.7) return "warning";
  return "success";
}

export function percentVariant(pct: number): "success" | "warning" | "danger" {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "success";
}
