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
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadProdWebConfig } from "./prod-web/config.mjs";
import { createRequestRouter } from "./prod-web/request-router.mjs";
import { createReverseProxy } from "./prod-web/reverse-proxy.mjs";
import { listenWithError, openFirewall } from "./prod-web/server-bootstrap.mjs";
import {
  createHttpRedirectHandler,
  createHttpUpgradeGate,
  withSecurityHeaders,
} from "./prod-web/security-headers.mjs";
import { safeJoin, sendFile } from "./prod-web/static-files.mjs";
import { loadTlsMaterials } from "./prod-web/tls-context.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const config = loadProdWebConfig(rootDir);

process.on("uncaughtException", (err) => {
  console.error("[guartrix] uncaught exception (server kept alive):", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[guartrix] unhandled rejection (server kept alive):", err);
});

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

const proxy = createReverseProxy(config);
const { handleRequest, handleUpgrade } = createRequestRouter(
  config,
  proxy,
  { safeJoin, sendFile },
  loadDownloadApi,
);

if (!fs.existsSync(path.join(config.DIST, "index.html"))) {
  console.error(
    `[guartrix] Missing ${path.join(config.DIST, "index.html")} — run npm run build first`,
  );
  process.exit(1);
}

const handleHttpRedirect = createHttpRedirectHandler(config, handleRequest);
const handleHttpUpgrade = createHttpUpgradeGate(config, handleUpgrade);

const httpServer = http.createServer(withSecurityHeaders(handleHttpRedirect));
httpServer.on("upgrade", handleHttpUpgrade);
listenWithError(httpServer, config, config.WEB_PORT, "http", () => {
  void loadDownloadApi().then((api) => {
    api?.logDownloadStatus?.(rootDir);
  });
});
openFirewall(config.WEB_PORT);

if (config.HTTPS_ENABLED) {
  try {
    const tls = loadTlsMaterials(config);
    const httpsServer = https.createServer(tls, withSecurityHeaders(handleRequest));
    httpsServer.on("upgrade", handleUpgrade);
    listenWithError(httpsServer, config, config.HTTPS_PORT, "https");
    openFirewall(config.HTTPS_PORT);
  } catch (err) {
    console.error("[guartrix] HTTPS disabled:", err instanceof Error ? err.message : err);
  }
}
