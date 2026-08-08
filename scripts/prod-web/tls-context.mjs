import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { spawnSync } from "node:child_process";

/** Load default + SNI TLS contexts for panel, license, daemon, and download hosts. */
export function loadTlsMaterials(config) {
  const {
    PUBLIC_HOST,
    CERT_DIR,
    ORIGIN_CERT,
    ORIGIN_KEY,
    CERT_FILE,
    KEY_FILE,
    LICENSE_PUBLIC_HOST,
    LICENSE_CERT_FILE,
    LICENSE_KEY_FILE,
    DAEMON_PUBLIC_HOST,
    DAEMON_CERT_FILE,
    DAEMON_KEY_FILE,
    DOWNLOAD_PUBLIC_HOST,
    DOWNLOAD_CERT_FILE,
    DOWNLOAD_KEY_FILE,
  } = config;

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

  const defaultSecure = tls.createSecureContext(defaultCtx);
  /** @type {Map<string, import("node:tls").SecureContext>} */
  const sniMap = new Map();

  if (LICENSE_PUBLIC_HOST && fs.existsSync(LICENSE_CERT_FILE) && fs.existsSync(LICENSE_KEY_FILE)) {
    sniMap.set(
      LICENSE_PUBLIC_HOST,
      tls.createSecureContext({
        key: fs.readFileSync(LICENSE_KEY_FILE),
        cert: fs.readFileSync(LICENSE_CERT_FILE),
      }),
    );
    console.log(`[guartrix] License SNI ${LICENSE_PUBLIC_HOST} → ${LICENSE_CERT_FILE}`);
  }

  if (DAEMON_PUBLIC_HOST && fs.existsSync(DAEMON_CERT_FILE) && fs.existsSync(DAEMON_KEY_FILE)) {
    sniMap.set(
      DAEMON_PUBLIC_HOST,
      tls.createSecureContext({
        key: fs.readFileSync(DAEMON_KEY_FILE),
        cert: fs.readFileSync(DAEMON_CERT_FILE),
      }),
    );
    console.log(`[guartrix] Daemon SNI ${DAEMON_PUBLIC_HOST} → ${DAEMON_CERT_FILE}`);
  }

  if (
    DOWNLOAD_PUBLIC_HOST &&
    fs.existsSync(DOWNLOAD_CERT_FILE) &&
    fs.existsSync(DOWNLOAD_KEY_FILE)
  ) {
    sniMap.set(
      DOWNLOAD_PUBLIC_HOST,
      tls.createSecureContext({
        key: fs.readFileSync(DOWNLOAD_KEY_FILE),
        cert: fs.readFileSync(DOWNLOAD_CERT_FILE),
      }),
    );
    console.log(`[guartrix] Download SNI ${DOWNLOAD_PUBLIC_HOST} → ${DOWNLOAD_CERT_FILE}`);
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
