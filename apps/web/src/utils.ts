import type { ServerStatus } from "@msm/shared";
import { formatBytes as sharedFormatBytes } from "@msm/shared";

export function statusVariant(
  status: ServerStatus,
): "success" | "danger" | "warning" | "secondary" | "info" {
  switch (status) {
    case "RUNNING":
      return "success";
    case "ERROR":
      return "danger";
    case "STARTING":
      return "info";
    case "STOPPING":
    case "CREATING":
    case "TRANSFERRING":
      return "warning";
    default:
      return "secondary";
  }
}

/** Custom themed status badge class (prefer over Bootstrap `bg-*`). */
export function statusBadgeClass(status: ServerStatus): string {
  switch (status) {
    case "RUNNING":
      return "status-badge status-badge-running";
    case "STARTING":
      return "status-badge status-badge-starting";
    case "STOPPING":
      return "status-badge status-badge-stopping";
    case "STOPPED":
      return "status-badge status-badge-stopped";
    case "CREATING":
    case "TRANSFERRING":
      return "status-badge status-badge-creating";
    case "ERROR":
      return "status-badge status-badge-error";
    default:
      return "status-badge status-badge-stopped";
  }
}

/** @deprecated use statusBadgeClass */
export function statusClass(status: ServerStatus): string {
  return statusBadgeClass(status);
}

export function typeLabel(type: string): string {
  switch (type) {
    case "VANILLA":
      return "Vanilla";
    case "PAPER":
      return "Paper";
    case "PURPUR":
      return "Purpur";
    case "FABRIC":
      return "Fabric";
    case "QUILT":
      return "Quilt";
    case "FORGE":
      return "Forge";
    case "NEOFORGE":
      return "NeoForge";
    case "BEDROCK":
      return "Bedrock (official)";
    case "BEDROCK_PREVIEW":
      return "Bedrock Preview";
    case "POCKETMINE":
      return "PocketMine-MP";
    case "NUKKIT":
      return "Nukkit";
    default:
      return type;
  }
}

export function typeIcon(type: string): string {
  switch (type) {
    case "PAPER":
      return "fa-scroll";
    case "PURPUR":
      return "fa-feather";
    case "FABRIC":
      return "fa-puzzle-piece";
    case "QUILT":
      return "fa-layer-group";
    case "FORGE":
      return "fa-hammer";
    case "NEOFORGE":
      return "fa-gears";
    case "BEDROCK":
    case "BEDROCK_PREVIEW":
      return "fa-mobile-screen";
    case "POCKETMINE":
      return "fa-code";
    case "NUKKIT":
      return "fa-cubes";
    default:
      return "fa-cube";
  }
}

export function getErrorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatBytes(bytes: number): string {
  const decimal =
    typeof document !== "undefined" && document.documentElement.dataset.unitPrefix === "decimal";
  if (!decimal) return sharedFormatBytes(bytes);
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1000 * 1000 * 1000) {
    return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
  }
  return `${(bytes / (1000 * 1000 * 1000)).toFixed(2)} GB`;
}

export function formatGb(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "—";
  const gb = mb / 1024;
  return `${gb.toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Copy text to clipboard; works on HTTP / self-signed HTTPS where Clipboard API is blocked. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to legacy path
    }
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("Copy failed");
}
