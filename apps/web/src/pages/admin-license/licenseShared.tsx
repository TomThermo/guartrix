import type { ReactNode } from "react";

export interface LicenseInfo {
  valid: boolean;
  status: string;
  message: string;
  expiresAt: string | null;
  label: string | null;
  checkedAt: string;
  keyMasked: string;
  hasKey: boolean;
  serverUrl: string;
  serverUrlSource: "file" | "env" | "default";
  serverUrlEnvDefault: string;
  maxServers?: number | null;
  maxNodes?: number | null;
  maxMemoryMb?: number | null;
  maxMemoryMbPerServer?: number | null;
  maxDiskMb?: number | null;
  freeTier?: boolean;
  features?: string[] | null;
  boundIp?: string | null;
  boundIps?: string[];
  usage?: {
    serverCount: number;
    memoryUsedMb: number;
    maxServerMemoryMb: number;
    nodeCount?: number;
  };
}

export const FEATURE_GROUPS: Array<{ id: string; label: string }> = [
  { id: "power", label: "Power" },
  { id: "user", label: "Subusers" },
  { id: "server", label: "Settings" },
  { id: "database", label: "Databases" },
  { id: "file", label: "Files" },
  { id: "backup", label: "Backups" },
  { id: "schedule", label: "Schedules" },
  { id: "player", label: "Players" },
  { id: "addon", label: "Addons" },
];

export function formatGb(mb: number): string {
  const gb = mb / 1024;
  if (Number.isInteger(gb)) return `${gb} GB`;
  return `${(Math.round(gb * 1000) / 1000).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })} GB`;
}

export function usagePct(used: number, limit: number | null | undefined): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

export function usageVariant(pct: number): string {
  if (pct >= 100) return "danger";
  if (pct >= 85) return "warning";
  return "success";
}

export function notifyLicenseChanged(valid?: boolean) {
  window.dispatchEvent(
    new CustomEvent("guartrix:license-changed", {
      detail: { valid },
    }),
  );
}

export function Meta({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="license-meta">
      <div className="license-meta-label">{label}</div>
      <div className={`license-meta-value${mono ? " font-monospace" : ""}`}>{children}</div>
    </div>
  );
}
