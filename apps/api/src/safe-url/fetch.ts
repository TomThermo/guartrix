import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import {
  resolveSafeDownloadUrl,
  resolveSafeOutboundUrl,
  resolveSafeWebhookUrl,
  type ResolvedSafeUrl,
  type SafeUrlOptions,
} from "./resolve.js";

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
export function fetchPinned(resolved: ResolvedSafeUrl, init: RequestInit = {}): Promise<Response> {
  if (!resolved.addresses.length) {
    return Promise.reject(new Error("Cannot fetch: no validated addresses (enable DNS resolve)"));
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
    const opts =
      typeof options === "function" || options == null
        ? ({} as { family?: number; all?: boolean })
        : (options as { family?: number; all?: boolean });
    const cb = typeof options === "function" ? options : (callback as (...args: unknown[]) => void);

    const choice = pinned[pinIndex % pinned.length]!;
    pinIndex += 1;
    const wantFamily = Number(opts.family) || 0;
    const match =
      wantFamily === 4 || wantFamily === 6
        ? (pinned.find((a) => a.family === wantFamily) ?? choice)
        : choice;

    if (opts.all) {
      const list = pinned.map((a) => ({
        address: a.address,
        family: a.family,
      }));
      (cb as (err: null, addresses: typeof list) => void)(null, list);
      return;
    }
    (cb as (err: NodeJS.ErrnoException | null, address: string, family: number) => void)(
      null,
      match.address,
      match.family,
    );
  };

  return new Promise<Response>((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

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

    if (signal) {
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
export async function fetchSafeWebhook(raw: string, init: RequestInit = {}): Promise<Response> {
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
