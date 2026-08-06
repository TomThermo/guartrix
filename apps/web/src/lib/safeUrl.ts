/**
 * Shared HTTP(S) URL allowlist helpers for rendered markdown / external links.
 * Addon + wiki both block loopback / local hosts (no SSRF via rendered links).
 */

function isBlockedLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal" ||
    host === "metadata"
  ) {
    return true;
  }
  // Literal private IPv4 in the URL host
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function parseSafeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (isBlockedLocalHost(u.hostname)) return null;
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
