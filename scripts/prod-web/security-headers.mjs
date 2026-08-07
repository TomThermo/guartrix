import crypto from "node:crypto";

/** Wrap a handler with CSP and baseline security headers. */
export function withSecurityHeaders(handler) {
  return (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    const scriptSrcExtra = (process.env.CSP_SCRIPT_SRC_EXTRA || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const allowUnsafeInlineScript =
      process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT === "1" ||
      process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT === "true";
    const cspNonce = crypto.randomBytes(16).toString("base64url");
    res.cspNonce = cspNonce;
    const cspDirectives = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "style-src-attr 'unsafe-inline'",
      [
        "script-src",
        "'self'",
        `'nonce-${cspNonce}'`,
        "https://static.cloudflareinsights.com",
        "https://challenges.cloudflare.com",
        ...(allowUnsafeInlineScript ? ["'unsafe-inline'"] : []),
        ...scriptSrcExtra,
      ].join(" "),
      "connect-src 'self' wss: https: https://cloudflareinsights.com",
      "frame-src 'self' https:",
      "form-action 'self'",
    ];
    res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
    if (
      process.env.CSP_REPORT_ONLY === "1" ||
      process.env.CSP_REPORT_ONLY === "true"
    ) {
      const reportOnly = cspDirectives.map((d) =>
        d.startsWith("style-src ")
          ? "style-src 'self'"
          : d.startsWith("style-src-attr ")
            ? "style-src-attr 'none'"
            : d,
      );
      res.setHeader(
        "Content-Security-Policy-Report-Only",
        reportOnly.join("; "),
      );
    }
    if (req.socket?.encrypted) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    return handler(req, res);
  };
}

/** Redirect cleartext panel traffic to HTTPS; localhost keeps HTTP for probes. */
export function createHttpRedirectHandler(config, handleRequest) {
  const {
    HTTPS_ENABLED,
    PUBLIC_HOST,
    LICENSE_PUBLIC_HOST,
    DAEMON_PUBLIC_HOST,
    DOWNLOAD_PUBLIC_HOST,
  } = config;

  return function handleHttpRedirect(req, res) {
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
    const redirectHost =
      LICENSE_PUBLIC_HOST && host === LICENSE_PUBLIC_HOST
        ? LICENSE_PUBLIC_HOST
        : DAEMON_PUBLIC_HOST && host === DAEMON_PUBLIC_HOST
          ? DAEMON_PUBLIC_HOST
          : DOWNLOAD_PUBLIC_HOST && host === DOWNLOAD_PUBLIC_HOST
            ? DOWNLOAD_PUBLIC_HOST
            : PUBLIC_HOST;
    const target = `https://${redirectHost}${req.url || "/"}`;
    res.writeHead(301, {
      Location: target,
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
    res.end();
  };
}

/** Require wss:// for WebSocket upgrades when HTTPS is enabled (except localhost). */
export function createHttpUpgradeGate(config, handleUpgrade) {
  const { HTTPS_ENABLED } = config;

  return function handleHttpUpgrade(req, socket, head) {
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
  };
}
