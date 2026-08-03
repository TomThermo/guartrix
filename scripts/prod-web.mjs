#!/usr/bin/env node
/**
 * Production static UI server.
 * - HTTP on WEB_PORT (default 80)
 * - HTTPS on HTTPS_PORT (default 443) using cert/guartrix.com.crt + .key
 *   (Cloudflare Origin), or TLS_CERT_FILE / TLS_KEY_FILE, else self-signed
 * Serves apps/web/dist and reverse-proxies /api + /ws to the API (default :3001).
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

// This server must stay up: log unexpected errors instead of letting Node's
// default behavior (crash the whole process) take the panel offline.
process.on("uncaughtException", (err) => {
  console.error("[guartrix] uncaught exception (server kept alive):", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[guartrix] unhandled rejection (server kept alive):", err);
});

loadEnvFile(path.join(rootDir, ".env"));

const WEB_PORT = Number(process.env.WEB_PORT ?? 80);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 443);
const HTTPS_ENABLED =
  process.env.HTTPS_ENABLED !== "0" &&
  process.env.HTTPS_ENABLED !== "false" &&
  Number.isFinite(HTTPS_PORT) &&
  HTTPS_PORT > 0;
const WEB_HOST = process.env.WEB_HOST ?? "0.0.0.0";
const API_HOST = process.env.API_PROXY_HOST ?? "127.0.0.1";
const API_PORT = Number(process.env.API_PORT ?? 3001);
const LICENSE_PROXY_HOST = process.env.LICENSE_PROXY_HOST ?? "127.0.0.1";
const LICENSE_PROXY_PORT = Number(process.env.LICENSE_PROXY_PORT ?? 4040);
const DAEMON_PROXY_HOST = process.env.DAEMON_PROXY_HOST ?? "127.0.0.1";
const DAEMON_PROXY_PORT = Number(
  process.env.DAEMON_PROXY_PORT ?? process.env.DAEMON_PORT ?? 8081,
);
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? "localhost";
/** Host header for the license API (e.g. license.guartrix.com). Empty = disabled. */
const LICENSE_PUBLIC_HOST = (
  process.env.LICENSE_PUBLIC_HOST?.trim() ||
  (PUBLIC_HOST && PUBLIC_HOST !== "localhost"
    ? `license.${PUBLIC_HOST.replace(/^www\./, "")}`
    : "")
).toLowerCase();
/**
 * Host header for the local daemon over HTTPS (e.g. node1.guartrix.com).
 * Empty = disabled. Set explicitly — do not invent a default for every install.
 */
const DAEMON_PUBLIC_HOST = (process.env.DAEMON_PUBLIC_HOST?.trim() || "").toLowerCase();
const DIST = path.join(rootDir, "apps/web/dist");
const CERT_DIR = path.join(rootDir, "data", "certs");
const ORIGIN_CERT = path.join(rootDir, "cert", "guartrix.com.crt");
const ORIGIN_KEY = path.join(rootDir, "cert", "guartrix.com.key");

function resolveTlsPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

const CERT_FILE = resolveTlsPath(
  process.env.TLS_CERT_FILE,
  fs.existsSync(ORIGIN_CERT) ? ORIGIN_CERT : path.join(CERT_DIR, "selfsigned.crt"),
);
const KEY_FILE = resolveTlsPath(
  process.env.TLS_KEY_FILE,
  fs.existsSync(ORIGIN_KEY) ? ORIGIN_KEY : path.join(CERT_DIR, "selfsigned.key"),
);

/** Let's Encrypt (or other public CA) for DNS-only license host. */
const DEFAULT_LICENSE_LE_CERT =
  "/etc/letsencrypt/live/license.guartrix.com/fullchain.pem";
const DEFAULT_LICENSE_LE_KEY =
  "/etc/letsencrypt/live/license.guartrix.com/privkey.pem";
const LICENSE_CERT_FILE = resolveTlsPath(
  process.env.LICENSE_TLS_CERT_FILE,
  fs.existsSync(DEFAULT_LICENSE_LE_CERT)
    ? DEFAULT_LICENSE_LE_CERT
    : path.join(CERT_DIR, "license.fullchain.pem"),
);
const LICENSE_KEY_FILE = resolveTlsPath(
  process.env.LICENSE_TLS_KEY_FILE,
  fs.existsSync(DEFAULT_LICENSE_LE_KEY)
    ? DEFAULT_LICENSE_LE_KEY
    : path.join(CERT_DIR, "license.privkey.pem"),
);

/** Let's Encrypt for DNS-only daemon host (node1.*). */
const DEFAULT_DAEMON_LE_CERT = DAEMON_PUBLIC_HOST
  ? `/etc/letsencrypt/live/${DAEMON_PUBLIC_HOST}/fullchain.pem`
  : "";
const DEFAULT_DAEMON_LE_KEY = DAEMON_PUBLIC_HOST
  ? `/etc/letsencrypt/live/${DAEMON_PUBLIC_HOST}/privkey.pem`
  : "";
const DAEMON_CERT_FILE = resolveTlsPath(
  process.env.DAEMON_TLS_CERT_FILE,
  DEFAULT_DAEMON_LE_CERT && fs.existsSync(DEFAULT_DAEMON_LE_CERT)
    ? DEFAULT_DAEMON_LE_CERT
    : path.join(CERT_DIR, "daemon.fullchain.pem"),
);
const DAEMON_KEY_FILE = resolveTlsPath(
  process.env.DAEMON_TLS_KEY_FILE,
  DEFAULT_DAEMON_LE_KEY && fs.existsSync(DEFAULT_DAEMON_LE_KEY)
    ? DEFAULT_DAEMON_LE_KEY
    : path.join(CERT_DIR, "daemon.privkey.pem"),
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function safeJoin(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  } catch {
    return null;
  }
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, cleaned);
  const rootResolved = path.resolve(root);
  const fullResolved = path.resolve(full);
  if (
    fullResolved !== rootResolved &&
    !fullResolved.startsWith(rootResolved + path.sep)
  ) {
    return null;
  }
  return fullResolved;
}

function sendFile(res, filePath) {
  const st = fs.statSync(filePath);
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = filePath.endsWith("index.html");
  const isSocialPreview =
    base === "og.jpg" || base === "og.png" || base === "favicon.ico";
  // Fixed-name WASM (and similar) must not be immutable forever — a wrong MIME
  // once cached breaks WebAssembly.instantiateStreaming for a year.
  const isVersionedAsset = ext === ".wasm";
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": st.size,
    "Cache-Control": isHtml
      ? "no-store, no-cache, must-revalidate"
      : isSocialPreview || isVersionedAsset
        ? "public, max-age=3600"
        : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(res);
}

/** Optional operator-only /download (file omitted from customer release zips). */
const downloadModulePath = path.join(__dirname, "prod-web-download.mjs");
let downloadApiPromise = null;
function loadDownloadApi() {
  if (!fs.existsSync(downloadModulePath)) return Promise.resolve(null);
  if (!downloadApiPromise) {
    downloadApiPromise = import(pathToFileURL(downloadModulePath).href)
      .then((m) => m)
      .catch((err) => {
        console.error("[guartrix] Failed to load prod-web-download.mjs:", err);
        return null;
      });
  }
  return downloadApiPromise;
}

function proxyHeaders(req) {
  const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };
  // Never trust client-supplied forwarding headers — overwrite from the socket.
  headers["x-forwarded-proto"] = req.socket?.encrypted ? "https" : "http";
  const remote = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  headers["x-forwarded-for"] = remote;
  delete headers["x-real-ip"];
  return headers;
}

/** Real client IP when Cloudflare is in front (license IP bind). */
function clientIpForLicense(req) {
  const cf = String(req.headers["cf-connecting-ip"] || "").trim();
  if (cf) return cf;
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    ?.trim();
  if (xf) return xf;
  return (req.socket?.remoteAddress || "").replace(/^::ffff:/, "") || "unknown";
}

function requestHost(req) {
  return String(req.headers.host || "")
    .split(",")[0]
    .trim()
    .replace(/:\d+$/, "")
    .toLowerCase();
}

function isLicenseHost(req) {
  return Boolean(LICENSE_PUBLIC_HOST) && requestHost(req) === LICENSE_PUBLIC_HOST;
}

function isDaemonHost(req) {
  return Boolean(DAEMON_PUBLIC_HOST) && requestHost(req) === DAEMON_PUBLIC_HOST;
}

function licenseProxyHeaders(req) {
  const clientIp = clientIpForLicense(req);
  const headers = { ...req.headers, host: `${LICENSE_PROXY_HOST}:${LICENSE_PROXY_PORT}` };
  headers["x-forwarded-proto"] = req.socket?.encrypted ? "https" : "http";
  headers["x-forwarded-for"] = clientIp;
  headers["x-real-ip"] = clientIp;
  return headers;
}

function daemonProxyHeaders(req) {
  const headers = { ...req.headers, host: `${DAEMON_PROXY_HOST}:${DAEMON_PROXY_PORT}` };
  headers["x-forwarded-proto"] = req.socket?.encrypted ? "https" : "http";
  const remote = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  headers["x-forwarded-for"] = remote;
  delete headers["x-real-ip"];
  return headers;
}

function proxyLicenseHttp(req, res) {
  const headers = licenseProxyHeaders(req);
  const proxyReq = http.request(
    {
      hostname: LICENSE_PROXY_HOST,
      port: LICENSE_PROXY_PORT,
      path: req.url,
      method: req.method,
      headers,
      timeout: 30_000,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end(`License proxy error: ${err.message}`);
    } else {
      res.destroy(err);
    }
  });
  req.on("aborted", () => proxyReq.destroy());
  req.pipe(proxyReq);
}

function proxyDaemonHttp(req, res) {
  const headers = daemonProxyHeaders(req);
  const proxyReq = http.request(
    {
      hostname: DAEMON_PROXY_HOST,
      port: DAEMON_PROXY_PORT,
      path: req.url,
      method: req.method,
      headers,
      timeout: 0,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end(`Daemon proxy error: ${err.message}`);
    } else {
      res.destroy(err);
    }
  });
  req.on("aborted", () => proxyReq.destroy());
  req.pipe(proxyReq);
}

function proxyDaemonWs(req, socket, head) {
  const headers = daemonProxyHeaders(req);
  const proxyReq = http.request({
    hostname: DAEMON_PROXY_HOST,
    port: DAEMON_PROXY_PORT,
    path: req.url,
    method: "GET",
    headers,
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const lines = ["HTTP/1.1 101 Switching Protocols"];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) lines.push(`${key}: ${v}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    socket.write(lines.join("\r\n") + "\r\n\r\n");
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });
  proxyReq.on("error", () => {
    socket.destroy();
  });
  proxyReq.on("response", (res) => {
    socket.write(
      `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\nConnection: close\r\n\r\n`,
    );
    res.pipe(socket);
  });
  if (head?.length) proxyReq.write(head);
  proxyReq.end();
}

function proxyHttp(req, res) {
  const headers = proxyHeaders(req);
  const proxyReq = http.request(
    {
      hostname: API_HOST,
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers,
      timeout: 0,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end(`API proxy error: ${err.message}`);
    } else {
      res.destroy(err);
    }
  });
  req.on("aborted", () => proxyReq.destroy());
  req.pipe(proxyReq);
}

function proxyWs(req, socket, head) {
  const headers = proxyHeaders(req);
  const proxyReq = http.request({
    hostname: API_HOST,
    port: API_PORT,
    path: req.url,
    method: "GET",
    headers,
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const lines = ["HTTP/1.1 101 Switching Protocols"];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) lines.push(`${key}: ${v}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    socket.write(lines.join("\r\n") + "\r\n\r\n");
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });
  proxyReq.on("error", () => {
    socket.destroy();
  });
  proxyReq.on("response", (res) => {
    socket.write(
      `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\nConnection: close\r\n\r\n`,
    );
    res.pipe(socket);
  });
  if (head?.length) proxyReq.write(head);
  proxyReq.end();
}

function handleRequestUnsafe(req, res) {
  if (isLicenseHost(req)) {
    proxyLicenseHttp(req, res);
    return;
  }
  if (isDaemonHost(req)) {
    proxyDaemonHttp(req, res);
    return;
  }

  const url = (req.url || "/").split("?")[0];
  if (url.startsWith("/api") || url.startsWith("/ws")) {
    proxyHttp(req, res);
    return;
  }

  // Public install scripts (multi-node curl | bash) — no auth
  if (url === "/install-daemon.sh" || url === "/install-panel.sh" || url === "/install.sh") {
    const scriptName =
      url === "/install-daemon.sh"
        ? "install-daemon.sh"
        : url === "/install.sh"
          ? "install.sh"
          : "install-panel.sh";
    const scriptPath = path.join(rootDir, "scripts", scriptName);
    if (!fs.existsSync(scriptPath)) {
      res.statusCode = 404;
      res.end("Install script not found");
      return;
    }
    const body = fs.readFileSync(scriptPath);
    res.writeHead(200, {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${scriptName}"`,
    });
    res.end(body);
    return;
  }

  if (url === "/download" || url.startsWith("/download/")) {
    void loadDownloadApi().then((api) => {
      if (!api?.handleDownload) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      return api.handleDownload(req, res, {
        rootDir,
        httpsEnabled: HTTPS_ENABLED,
        safeJoin,
      });
    });
    return;
  }

  let filePath = safeJoin(DIST, url === "/" ? "/index.html" : url);
  if (!filePath) {
    res.statusCode = 400;
    res.end("Bad path");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  sendFile(res, path.join(DIST, "index.html"));
}

// Last line of defense: a single bad request (malformed URL, race on a file
// being removed mid-request, etc.) must never take down the whole server.
function handleRequest(req, res) {
  try {
    handleRequestUnsafe(req, res);
  } catch (err) {
    console.error("[guartrix] request handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal server error");
    } else {
      res.destroy();
    }
  }
}

function handleUpgrade(req, socket, head) {
  try {
    if (isDaemonHost(req)) {
      proxyDaemonWs(req, socket, head);
      return;
    }
    const url = req.url || "/";
    if (url.startsWith("/ws") || url.startsWith("/api")) {
      proxyWs(req, socket, head);
      return;
    }
    socket.destroy();
  } catch (err) {
    console.error("[guartrix] upgrade handler error:", err);
    socket.destroy();
  }
}

function loadTlsMaterials() {
  const usingOrigin =
    path.resolve(CERT_FILE) === path.resolve(ORIGIN_CERT) ||
    path.resolve(KEY_FILE) === path.resolve(ORIGIN_KEY);

  let defaultCtx;
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    console.log(
      usingOrigin || CERT_FILE.includes("guartrix.com")
        ? `[guartrix] Using TLS cert ${CERT_FILE}`
        : `[guartrix] Using TLS cert ${CERT_FILE} (set cert/guartrix.com.crt for Cloudflare Origin)`,
    );
    defaultCtx = {
      key: fs.readFileSync(KEY_FILE),
      cert: fs.readFileSync(CERT_FILE),
    };
  } else {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    console.log(
      `[guartrix] Generating self-signed TLS cert for ${PUBLIC_HOST} (temporary — browser will warn)`,
    );
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(PUBLIC_HOST);
    const san = isIp
      ? `IP:${PUBLIC_HOST},DNS:localhost,IP:127.0.0.1`
      : `DNS:${PUBLIC_HOST},DNS:localhost,IP:127.0.0.1`;
    const result = spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-days",
        "825",
        "-nodes",
        "-keyout",
        KEY_FILE,
        "-out",
        CERT_FILE,
        "-subj",
        `/CN=${PUBLIC_HOST}`,
        "-addext",
        `subjectAltName=${san}`,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout || "openssl failed");
      throw new Error("Failed to generate self-signed certificate (is openssl installed?)");
    }
    defaultCtx = {
      key: fs.readFileSync(KEY_FILE),
      cert: fs.readFileSync(CERT_FILE),
    };
  }

  // SNI: public CA for DNS-only license/daemon hosts; Origin/default for panel behind Cloudflare.
  const defaultSecure = tls.createSecureContext(defaultCtx);
  /** @type {Map<string, import("node:tls").SecureContext>} */
  const sniMap = new Map();

  if (
    LICENSE_PUBLIC_HOST &&
    fs.existsSync(LICENSE_CERT_FILE) &&
    fs.existsSync(LICENSE_KEY_FILE)
  ) {
    sniMap.set(
      LICENSE_PUBLIC_HOST,
      tls.createSecureContext({
        key: fs.readFileSync(LICENSE_KEY_FILE),
        cert: fs.readFileSync(LICENSE_CERT_FILE),
      }),
    );
    console.log(
      `[guartrix] License SNI ${LICENSE_PUBLIC_HOST} → ${LICENSE_CERT_FILE}`,
    );
  }

  if (
    DAEMON_PUBLIC_HOST &&
    fs.existsSync(DAEMON_CERT_FILE) &&
    fs.existsSync(DAEMON_KEY_FILE)
  ) {
    sniMap.set(
      DAEMON_PUBLIC_HOST,
      tls.createSecureContext({
        key: fs.readFileSync(DAEMON_KEY_FILE),
        cert: fs.readFileSync(DAEMON_CERT_FILE),
      }),
    );
    console.log(
      `[guartrix] Daemon SNI ${DAEMON_PUBLIC_HOST} → ${DAEMON_CERT_FILE}`,
    );
  }

  if (sniMap.size === 0) {
    return defaultCtx;
  }

  return {
    ...defaultCtx,
    SNICallback(servername, cb) {
      try {
        const host = String(servername || "")
          .split(":")[0]
          .toLowerCase();
        cb(null, sniMap.get(host) ?? defaultSecure);
      } catch (err) {
        console.error("[guartrix] SNICallback error:", err);
        cb(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}

function listenWithError(server, port, label) {
  server.on("error", (err) => {
    if (err && err.code === "EACCES") {
      console.error(
        `[guartrix] Cannot bind ${label} port ${port} (permission denied). Use sudo.`,
      );
    } else if (err && err.code === "EADDRINUSE") {
      console.error(`[guartrix] ${label} port ${port} is already in use.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
  server.listen(port, WEB_HOST, () => {
    console.log(
      `[guartrix] Web UI ${label} on ${WEB_HOST}:${port} (API proxy → ${API_HOST}:${API_PORT})`,
    );
    if (LICENSE_PUBLIC_HOST) {
      console.log(
        `[guartrix] License host ${LICENSE_PUBLIC_HOST} → ${LICENSE_PROXY_HOST}:${LICENSE_PROXY_PORT}`,
      );
    }
    if (DAEMON_PUBLIC_HOST) {
      console.log(
        `[guartrix] Daemon host ${DAEMON_PUBLIC_HOST} → ${DAEMON_PROXY_HOST}:${DAEMON_PROXY_PORT}`,
      );
    }
    void loadDownloadApi().then((api) => {
      api?.logDownloadStatus?.(rootDir);
    });
  });
}

function openFirewall(port) {
  if (process.env.MANAGE_FIREWALL !== "true" && process.env.MANAGE_FIREWALL !== "1") {
    return;
  }
  const child = spawn("sudo", ["-n", "ufw", "allow", `${port}/tcp`], {
    stdio: "ignore",
  });
  child.on("error", () => undefined);
}

function handleHttpRedirect(req, res) {
  // When HTTPS is enabled, never serve the panel over cleartext on :80
  // (Cloudflare Full Strict uses :443 to origin; direct IP hits get redirected).
  // Keep localhost HTTP for local health probes from start.sh / monitor.
  if (!HTTPS_ENABLED) {
    handleRequest(req, res);
    return;
  }
  const rawHost = String(req.headers.host || "").split(",")[0].trim();
  const host = rawHost.replace(/:\d+$/, "").toLowerCase();
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    handleRequest(req, res);
    return;
  }
  // Never trust arbitrary Host headers (open redirect). Only redirect to PUBLIC_HOST
  // (or keep license/daemon hosts on HTTPS so public CA + DNS-only works).
  const redirectHost =
    LICENSE_PUBLIC_HOST && host === LICENSE_PUBLIC_HOST
      ? LICENSE_PUBLIC_HOST
      : DAEMON_PUBLIC_HOST && host === DAEMON_PUBLIC_HOST
        ? DAEMON_PUBLIC_HOST
        : PUBLIC_HOST;
  const target = `https://${redirectHost}${req.url || "/"}`;
  res.writeHead(301, {
    Location: target,
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  });
  res.end();
}

function withSecurityHeaders(handler) {
  return (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.socket?.encrypted) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    return handler(req, res);
  };
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(
    `[guartrix] Missing ${path.join(DIST, "index.html")} — run npm run build first`,
  );
  process.exit(1);
}

const httpServer = http.createServer(withSecurityHeaders(handleHttpRedirect));
httpServer.on("upgrade", (req, socket, head) => {
  if (!HTTPS_ENABLED) {
    handleUpgrade(req, socket, head);
    return;
  }
  const rawHost = String(req.headers.host || "").split(",")[0].trim();
  const host = rawHost.replace(/:\d+$/, "").toLowerCase();
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    handleUpgrade(req, socket, head);
    return;
  }
  socket.write(
    "HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\nUse wss:// on HTTPS\r\n",
  );
  socket.destroy();
});
listenWithError(httpServer, WEB_PORT, "http");
openFirewall(WEB_PORT);

if (HTTPS_ENABLED) {
  try {
    const tls = loadTlsMaterials();
    const httpsServer = https.createServer(
      tls,
      withSecurityHeaders(handleRequest),
    );
    httpsServer.on("upgrade", handleUpgrade);
    listenWithError(httpsServer, HTTPS_PORT, "https");
    openFirewall(HTTPS_PORT);
  } catch (err) {
    console.error("[guartrix] HTTPS disabled:", err instanceof Error ? err.message : err);
  }
}
