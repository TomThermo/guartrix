import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";

function resolveTlsPath(rootDir, value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

/** Read .env and derive prod-web host/proxy/TLS paths. */
export function loadProdWebConfig(rootDir) {
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
  const LICENSE_PUBLIC_HOST = (
    process.env.LICENSE_PUBLIC_HOST?.trim() ||
    (PUBLIC_HOST && PUBLIC_HOST !== "localhost"
      ? `license.${PUBLIC_HOST.replace(/^www\./, "")}`
      : "")
  ).toLowerCase();
  const DAEMON_PUBLIC_HOST = (process.env.DAEMON_PUBLIC_HOST?.trim() || "").toLowerCase();
  const DOWNLOAD_PUBLIC_HOST = (
    process.env.DOWNLOAD_PUBLIC_HOST?.trim() || ""
  ).toLowerCase();

  const DIST = path.join(rootDir, "apps/web/dist");
  const CERT_DIR = path.join(rootDir, "data", "certs");
  const ORIGIN_CERT = path.join(rootDir, "cert", "guartrix.com.crt");
  const ORIGIN_KEY = path.join(rootDir, "cert", "guartrix.com.key");

  const CERT_FILE = resolveTlsPath(
    rootDir,
    process.env.TLS_CERT_FILE,
    fs.existsSync(ORIGIN_CERT) ? ORIGIN_CERT : path.join(CERT_DIR, "selfsigned.crt"),
  );
  const KEY_FILE = resolveTlsPath(
    rootDir,
    process.env.TLS_KEY_FILE,
    fs.existsSync(ORIGIN_KEY) ? ORIGIN_KEY : path.join(CERT_DIR, "selfsigned.key"),
  );

  const DEFAULT_LICENSE_LE_CERT =
    "/etc/letsencrypt/live/license.guartrix.com/fullchain.pem";
  const DEFAULT_LICENSE_LE_KEY =
    "/etc/letsencrypt/live/license.guartrix.com/privkey.pem";
  const LICENSE_CERT_FILE = resolveTlsPath(
    rootDir,
    process.env.LICENSE_TLS_CERT_FILE,
    fs.existsSync(DEFAULT_LICENSE_LE_CERT)
      ? DEFAULT_LICENSE_LE_CERT
      : path.join(CERT_DIR, "license.fullchain.pem"),
  );
  const LICENSE_KEY_FILE = resolveTlsPath(
    rootDir,
    process.env.LICENSE_TLS_KEY_FILE,
    fs.existsSync(DEFAULT_LICENSE_LE_KEY)
      ? DEFAULT_LICENSE_LE_KEY
      : path.join(CERT_DIR, "license.privkey.pem"),
  );

  const DEFAULT_DAEMON_LE_CERT = DAEMON_PUBLIC_HOST
    ? `/etc/letsencrypt/live/${DAEMON_PUBLIC_HOST}/fullchain.pem`
    : "";
  const DEFAULT_DAEMON_LE_KEY = DAEMON_PUBLIC_HOST
    ? `/etc/letsencrypt/live/${DAEMON_PUBLIC_HOST}/privkey.pem`
    : "";
  const DAEMON_CERT_FILE = resolveTlsPath(
    rootDir,
    process.env.DAEMON_TLS_CERT_FILE,
    DEFAULT_DAEMON_LE_CERT && fs.existsSync(DEFAULT_DAEMON_LE_CERT)
      ? DEFAULT_DAEMON_LE_CERT
      : path.join(CERT_DIR, "daemon.fullchain.pem"),
  );
  const DAEMON_KEY_FILE = resolveTlsPath(
    rootDir,
    process.env.DAEMON_TLS_KEY_FILE,
    DEFAULT_DAEMON_LE_KEY && fs.existsSync(DEFAULT_DAEMON_LE_KEY)
      ? DEFAULT_DAEMON_LE_KEY
      : path.join(CERT_DIR, "daemon.privkey.pem"),
  );

  const DEFAULT_DOWNLOAD_LE_CERT = DOWNLOAD_PUBLIC_HOST
    ? `/etc/letsencrypt/live/${DOWNLOAD_PUBLIC_HOST}/fullchain.pem`
    : "";
  const DEFAULT_DOWNLOAD_LE_KEY = DOWNLOAD_PUBLIC_HOST
    ? `/etc/letsencrypt/live/${DOWNLOAD_PUBLIC_HOST}/privkey.pem`
    : "";
  const DOWNLOAD_CERT_FILE = resolveTlsPath(
    rootDir,
    process.env.DOWNLOAD_TLS_CERT_FILE,
    DEFAULT_DOWNLOAD_LE_CERT && fs.existsSync(DEFAULT_DOWNLOAD_LE_CERT)
      ? DEFAULT_DOWNLOAD_LE_CERT
      : path.join(CERT_DIR, "download.fullchain.pem"),
  );
  const DOWNLOAD_KEY_FILE = resolveTlsPath(
    rootDir,
    process.env.DOWNLOAD_TLS_KEY_FILE,
    DEFAULT_DOWNLOAD_LE_KEY && fs.existsSync(DEFAULT_DOWNLOAD_LE_KEY)
      ? DEFAULT_DOWNLOAD_LE_KEY
      : path.join(CERT_DIR, "download.privkey.pem"),
  );

  return {
    rootDir,
    WEB_PORT,
    HTTPS_PORT,
    HTTPS_ENABLED,
    WEB_HOST,
    API_HOST,
    API_PORT,
    LICENSE_PROXY_HOST,
    LICENSE_PROXY_PORT,
    DAEMON_PROXY_HOST,
    DAEMON_PROXY_PORT,
    PUBLIC_HOST,
    LICENSE_PUBLIC_HOST,
    DAEMON_PUBLIC_HOST,
    DOWNLOAD_PUBLIC_HOST,
    DIST,
    CERT_DIR,
    ORIGIN_CERT,
    ORIGIN_KEY,
    CERT_FILE,
    KEY_FILE,
    LICENSE_CERT_FILE,
    LICENSE_KEY_FILE,
    DAEMON_CERT_FILE,
    DAEMON_KEY_FILE,
    DOWNLOAD_CERT_FILE,
    DOWNLOAD_KEY_FILE,
  };
}
