import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";

/**
 * Outbound URL safety for webhooks and package downloads.
 * Blocks non-HTTPS (optional), private/link-local/metadata targets, and
 * optionally requires an allowlisted hostname.
 * Fetches pin DNS to the pre-validated address (anti rebinding TOCTOU).
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

export type ResolvedSafeUrl = {
  href: string;
  hostname: string;
  /** Public addresses validated before connect; fetch must pin to these. */
  addresses: Array<{ address: string; family: 4 | 6 }>;
};

function hostAllowed(hostname: string, suffixes: string[]): boolean {
  const h = normalizeHostname(hostname);
  return suffixes.some((suf) => {
    const s = normalizeHostname(suf);
    return h === s || h.endsWith(`.${s}`);
  });
}

async function resolvePublicAddresses(
  hostname: string,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error(`URL host is a private or blocked address (${hostname})`);
    }
    const family = net.isIPv6(hostname) ? 6 : 4;
    return [{ address: hostname, family }];
  }

  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`Cannot resolve URL host: ${hostname}`);
  }
  if (!answers.length) throw new Error(`Cannot resolve URL host: ${hostname}`);

  const out: Array<{ address: string; family: 4 | 6 }> = [];
  for (const a of answers) {
    if (isBlockedIp(a.address)) {
      throw new Error(`URL resolves to a private or blocked address (${a.address})`);
    }
    out.push({ address: a.address, family: a.family === 6 ? 6 : 4 });
  }
  return out;
}

/**
 * Throws if the URL is unsafe to fetch from the panel process.
 * Returns the normalized href (legacy callers).
 */
export async function assertSafeOutboundUrl(
  raw: string,
  opts: SafeUrlOptions = {},
): Promise<string> {
  const resolved = await resolveSafeOutboundUrl(raw, opts);
  return resolved.href;
}

/**
 * Validate + DNS-resolve an outbound URL. Prefer this when you will fetch —
 * pin the connection with {@link fetchPinned}.
 */
export async function resolveSafeOutboundUrl(
  raw: string,
  opts: SafeUrlOptions = {},
): Promise<ResolvedSafeUrl> {
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

  const addresses = resolveDns
    ? await resolvePublicAddresses(hostname)
    : net.isIP(hostname)
      ? await resolvePublicAddresses(hostname)
      : [];

  return { href: parsed.href, hostname, addresses };
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
  const resolved = await resolveSafeOutboundUrl(raw, { httpsOnly: true });
  const u = new URL(resolved.href);
  const host = normalizeHostname(u.hostname);
  if (hostAllowed(host, DISCORD_WEBHOOK_HOST_SUFFIXES)) {
    if (!/\/api\/webhooks\/\d+\/[\w-]+/i.test(u.pathname)) {
      throw new Error("Discord webhook URL path is invalid");
    }
  }
  return resolved.href;
}

export async function resolveSafeWebhookUrl(raw: string): Promise<ResolvedSafeUrl> {
  const resolved = await resolveSafeOutboundUrl(raw, { httpsOnly: true });
  const u = new URL(resolved.href);
  const host = normalizeHostname(u.hostname);
  if (hostAllowed(host, DISCORD_WEBHOOK_HOST_SUFFIXES)) {
    if (!/\/api\/webhooks\/\d+\/[\w-]+/i.test(u.pathname)) {
      throw new Error("Discord webhook URL path is invalid");
    }
  }
  return resolved;
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

export async function resolveSafeDownloadUrl(raw: string): Promise<ResolvedSafeUrl> {
  return resolveSafeOutboundUrl(raw, {
    httpsOnly: true,
    allowedHostSuffixes: DOWNLOAD_HOST_SUFFIXES,
  });
}

function headersToRecord(headers?: HeadersInit): http.OutgoingHttpHeaders {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: http.OutgoingHttpHeaders = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    const out: http.OutgoingHttpHeaders = {};
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...headers };
}

/**
 * Fetch using a DNS lookup pinned to pre-validated public addresses.
 * Prevents DNS rebinding between assertSafe* and connect.
 */
export function fetchPinned(
  resolved: ResolvedSafeUrl,
  init: RequestInit = {},
): Promise<Response> {
  if (!resolved.addresses.length) {
    return Promise.reject(
      new Error("Cannot fetch: no validated addresses (enable DNS resolve)"),
    );
  }

  const url = new URL(resolved.href);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;
  const method = (init.method ?? "GET").toUpperCase();
  const headers = headersToRecord(init.headers);
  if (!headers.host && !headers.Host) {
    headers.host = url.host;
  }

  const pinned = resolved.addresses;
  let pinIndex = 0;
  const lookup: LookupFunction = (_hostname, options, callback) => {
    const cb =
      typeof options === "function"
        ? options
        : (callback as (
            err: NodeJS.ErrnoException | null,
            address: string,
            family: number,
          ) => void);
    const choice = pinned[pinIndex % pinned.length]!;
    pinIndex += 1;
    // Prefer family match when Node asks for a specific family
    const wantFamily =
      typeof options === "object" && options && "family" in options
        ? Number((options as { family?: number }).family)
        : 0;
    const match =
      wantFamily === 4 || wantFamily === 6
        ? pinned.find((a) => a.family === wantFamily) ?? choice
        : choice;
    cb(null, match.address, match.family);
  };

  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        servername: isHttps ? url.hostname : undefined,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        lookup,
        // manual redirects handled by callers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const headerInit: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            headerInit[key] = Array.isArray(value) ? value.join(", ") : value;
          }
          resolve(
            new Response(body, {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? "",
              headers: headerInit,
            }),
          );
        });
        res.on("error", reject);
      },
    );

    const signal = init.signal;
    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const onAbort = () => {
        req.destroy();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => signal.removeEventListener("abort", onAbort));
    }

    req.on("error", reject);

    const body = init.body;
    if (body == null || method === "GET" || method === "HEAD") {
      req.end();
      return;
    }
    if (typeof body === "string" || Buffer.isBuffer(body)) {
      req.end(body);
      return;
    }
    if (body instanceof Uint8Array) {
      req.end(Buffer.from(body));
      return;
    }
    // Avoid streaming exotic body types in panel call sites (JSON strings only).
    reject(new Error("Unsupported request body type for pinned fetch"));
  });
}

/**
 * Fetch a download URL with HTTPS + host allowlist, re-validating each redirect,
 * pinning DNS on every hop.
 */
export async function fetchSafeDownload(
  raw: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  let current = await resolveSafeDownloadUrl(raw);
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetchPinned(current, {
      ...init,
      // pinned helper does not follow redirects
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without Location header");
      current = await resolveSafeDownloadUrl(new URL(loc, current.href).href);
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects while downloading");
}

/** Safe HTTPS fetch for webhooks (no redirects; DNS pinned). */
export async function fetchSafeWebhook(
  raw: string,
  init: RequestInit = {},
): Promise<Response> {
  const resolved = await resolveSafeWebhookUrl(raw);
  return fetchPinned(resolved, { ...init, redirect: "manual" });
}

/** Safe outbound fetch with optional host allowlist (DNS pinned; no redirects). */
export async function fetchSafeOutbound(
  raw: string,
  init: RequestInit = {},
  opts: SafeUrlOptions = {},
): Promise<Response> {
  const resolved = await resolveSafeOutboundUrl(raw, opts);
  return fetchPinned(resolved, { ...init, redirect: "manual" });
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
