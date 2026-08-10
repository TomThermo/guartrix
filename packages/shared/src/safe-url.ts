/**
 * Pure HTTP(S) URL / host safety helpers (browser + API).
 * Matches panel SSRF host policy: block loopback, private, link-local,
 * CGNAT, multicast, metadata hostnames — without Node `net` (works in web).
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

export function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Dotted-decimal IPv4 (octets 0–255, no leading zeros except bare 0). */
function isIPv4(v: string): boolean {
  const parts = v.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return false;
    const n = Number(p);
    if (n > 255) return false;
  }
  return true;
}

/**
 * IPv6 literal (including IPv4-mapped `::ffff:a.b.c.d`).
 * Uses WHATWG URL bracket parsing — available in Node and browsers.
 */
function isIPv6(v: string): boolean {
  if (!v || v.includes("[") || v.includes("]")) return false;
  try {
    new URL(`http://[${v}]/`);
    return true;
  } catch {
    return false;
  }
}

function isIpLiteral(v: string): boolean {
  return isIPv4(v) || isIPv6(v);
}

/** True for IPv4/IPv6 addresses that must never be fetched / linked by the panel. */
export function isBlockedIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v) return true;

  if (isIPv4(v)) {
    const parts = v.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const a = parts[0]!;
    const b = parts[1]!;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (isIPv6(v)) {
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA
    if (v.startsWith("fe80")) return true; // link-local
    // IPv4-mapped
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(v);
    if (mapped) return isBlockedIp(mapped[1]!);
    return false;
  }

  return true;
}

export function hostLooksLocal(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (isIpLiteral(h)) return isBlockedIp(h);
  return false;
}

/** Parse and allowlist http(s) URLs for markdown / UI links (no credentials, no local hosts). */
export function parseSafeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    const host = normalizeHostname(u.hostname);
    if (!host || hostLooksLocal(host)) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Safe http(s) URL for addon markdown (blocks local / loopback / private hosts). */
export function safeHttpUrl(raw: string | undefined): string | null {
  return parseSafeHttpUrl(raw);
}

/** Safe http(s) URL for wiki / docs external links (same host policy as addons). */
export function safeExternalUrl(raw: string): string | null {
  return parseSafeHttpUrl(raw);
}
