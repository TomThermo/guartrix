import dns from "node:dns/promises";
import net from "node:net";

/**
 * Outbound URL safety for webhooks and package downloads.
 * Blocks non-HTTPS (optional), private/link-local/metadata targets, and
 * optionally requires an allowlisted hostname.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** True for IPv4/IPv6 addresses that must never be fetched by the panel. */
export function isBlockedIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v) return true;

  if (net.isIPv4(v)) {
    const parts = v.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(v)) {
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

function hostLooksLocal(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (net.isIP(h)) return isBlockedIp(h);
  return false;
}

export type SafeUrlOptions = {
  /** Default true — only https: */
  httpsOnly?: boolean;
  /** If set, hostname must equal or be a subdomain of one entry */
  allowedHostSuffixes?: string[];
  /** Resolve DNS and reject private answers (default true) */
  resolveDns?: boolean;
};

function hostAllowed(hostname: string, suffixes: string[]): boolean {
  const h = normalizeHostname(hostname);
  return suffixes.some((suf) => {
    const s = normalizeHostname(suf);
    return h === s || h.endsWith(`.${s}`);
  });
}

/**
 * Throws if the URL is unsafe to fetch from the panel process.
 * Returns the normalized href.
 */
export async function assertSafeOutboundUrl(
  raw: string,
  opts: SafeUrlOptions = {},
): Promise<string> {
  const httpsOnly = opts.httpsOnly !== false;
  const resolveDns = opts.resolveDns !== false;
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL is required");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL");
  }

  if (httpsOnly && parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  if (!httpsOnly && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP(S) URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostLooksLocal(hostname)) {
    throw new Error("URL host is not allowed");
  }

  if (opts.allowedHostSuffixes?.length) {
    if (!hostAllowed(hostname, opts.allowedHostSuffixes)) {
      throw new Error(`URL host is not on the allowlist: ${hostname}`);
    }
  }

  if (resolveDns && !net.isIP(hostname)) {
    let answers: Array<{ address: string; family: number }>;
    try {
      answers = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error(`Cannot resolve URL host: ${hostname}`);
    }
    if (!answers.length) throw new Error(`Cannot resolve URL host: ${hostname}`);
    for (const a of answers) {
      if (isBlockedIp(a.address)) {
        throw new Error(`URL resolves to a private or blocked address (${a.address})`);
      }
    }
  }

  return parsed.href;
}

/** Discord webhook host allowlist (status + alerts). */
export const DISCORD_WEBHOOK_HOST_SUFFIXES = [
  "discord.com",
  "discordapp.com",
];

/**
 * Validate a user/operator webhook URL.
 * Discord URLs must match the webhook path; other HTTPS URLs are allowed if
 * they do not resolve to private addresses.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<string> {
  const href = await assertSafeOutboundUrl(raw, { httpsOnly: true });
  const u = new URL(href);
  const host = normalizeHostname(u.hostname);
  if (hostAllowed(host, DISCORD_WEBHOOK_HOST_SUFFIXES)) {
    if (!/\/api\/webhooks\/\d+\/[\w-]+/i.test(u.pathname)) {
      throw new Error("Discord webhook URL path is invalid");
    }
  }
  return href;
}

/** Hosts we trust for jar / modpack / installer downloads. */
export const DOWNLOAD_HOST_SUFFIXES = [
  "modrinth.com",
  "modrinthusercontent.com",
  "forgecdn.net",
  "curseforge.com",
  "githubusercontent.com",
  "github.com",
  "minecraft.net",
  "mojang.com",
  "minecraftforge.net",
  "neoforged.net",
  "fabricmc.net",
  "quiltmc.org",
  "papermc.io",
  "purpurmc.org",
  "maven.org",
  "apache.org",
  "opencollab.dev",
  "minecraft-services.net",
  "azureedge.net",
  "raw.githubusercontent.com",
];

export async function assertSafeDownloadUrl(raw: string): Promise<string> {
  return assertSafeOutboundUrl(raw, {
    httpsOnly: true,
    allowedHostSuffixes: DOWNLOAD_HOST_SUFFIXES,
  });
}

/**
 * Fetch a download URL with HTTPS + host allowlist, re-validating each redirect.
 */
export async function fetchSafeDownload(
  raw: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  let current = await assertSafeDownloadUrl(raw);
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers ?? {}),
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without Location header");
      current = await assertSafeDownloadUrl(new URL(loc, current).href);
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects while downloading");
}

/** http(s) only, for UI links / iframes (no DNS check — browser will navigate). */
export function assertSafeBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only HTTP(S) URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const host = normalizeHostname(parsed.hostname);
  if (!host || hostLooksLocal(host)) {
    throw new Error("URL host is not allowed");
  }
  return parsed.href;
}
