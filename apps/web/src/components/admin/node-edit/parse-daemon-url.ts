import type { DaemonNode } from "@guartrix/shared";

export function statusVariant(status: DaemonNode["status"]): "success" | "danger" | "secondary" {
  if (status === "ONLINE") return "success";
  if (status === "OFFLINE") return "danger";
  return "secondary";
}

/** Parse panel→daemon URL into scheme / host / port. */
export function parseDaemonPublicUrl(raw: string): {
  scheme: "http" | "https";
  fqdn: string;
  daemonPort: number;
} {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Daemon URL is required");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid daemon URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Daemon URL must be http:// or https://");
  }
  const fqdn = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!fqdn) throw new Error("Daemon URL needs a hostname or IP");
  const daemonPort =
    parsed.port !== "" ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 8081;
  if (!Number.isInteger(daemonPort) || daemonPort < 1 || daemonPort > 65535) {
    throw new Error("Invalid daemon port");
  }
  return {
    scheme: parsed.protocol === "https:" ? "https" : "http",
    fqdn,
    daemonPort,
  };
}

export type TabId = "overview" | "settings" | "advanced" | "config" | "allocations";
export type SslMode = "http" | "https" | "https-proxy";

export function sslModeFromNode(node: DaemonNode): SslMode {
  if (node.scheme === "https" && node.behindProxy) return "https-proxy";
  if (node.scheme === "https") return "https";
  return "http";
}

export function schemeFromSslMode(mode: SslMode): "http" | "https" {
  return mode === "http" ? "http" : "https";
}
