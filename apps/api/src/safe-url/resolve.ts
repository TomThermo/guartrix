import dns from "node:dns/promises";
import net from "node:net";
import { hostLooksLocal, isBlockedIp, normalizeHostname } from "./ip.js";

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

export function hostAllowed(hostname: string, suffixes: string[]): boolean {
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
export const DISCORD_WEBHOOK_HOST_SUFFIXES = ["discord.com", "discordapp.com"];

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
