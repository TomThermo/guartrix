/**
 * Shared HTTP(S) URL allowlist helpers for rendered markdown / external links.
 * Keep callers' semantics: addon markdown blocks local hosts; wiki allows them.
 */

export type SafeUrlOptions = {
  /** Reject loopback / localhost / .local hosts (addon markdown images & links). */
  blockLocalHosts?: boolean;
};

function parseSafeHttpUrl(
  raw: string | undefined,
  opts?: SafeUrlOptions,
): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (opts?.blockLocalHosts) {
      const host = u.hostname.toLowerCase();
      if (
        !host ||
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host === "127.0.0.1" ||
        host === "::1"
      ) {
        return null;
      }
    }
    return u.href;
  } catch {
    return null;
  }
}

/** Safe http(s) URL for addon markdown (blocks local / loopback hosts). */
export function safeHttpUrl(raw: string | undefined): string | null {
  return parseSafeHttpUrl(raw, { blockLocalHosts: true });
}

/** Safe http(s) URL for wiki / docs external links (credentials & scheme only). */
export function safeExternalUrl(raw: string): string | null {
  return parseSafeHttpUrl(raw);
}
