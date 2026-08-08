import http from "node:http";

/** Build API/license/daemon reverse-proxy helpers from prod-web config. */
export function createReverseProxy(config) {
  const {
    API_HOST,
    API_PORT,
    LICENSE_PROXY_HOST,
    LICENSE_PROXY_PORT,
    DAEMON_PROXY_HOST,
    DAEMON_PROXY_PORT,
    LICENSE_PUBLIC_HOST,
    DAEMON_PUBLIC_HOST,
  } = config;

  /** Prefer edge-provided scheme (Cloudflare) over the CF→origin socket. */
  function forwardedProto(req) {
    const xf = String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (xf === "https" || xf === "http") return xf;
    const cfVisitor = String(req.headers["cf-visitor"] || "");
    if (/"scheme"\s*:\s*"https"/i.test(cfVisitor)) return "https";
    if (/"scheme"\s*:\s*"http"/i.test(cfVisitor)) return "http";
    return req.socket?.encrypted ? "https" : "http";
  }

  function proxyHeaders(req) {
    const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };
    headers["x-forwarded-proto"] = forwardedProto(req);
    const remote = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    headers["x-forwarded-for"] = remote;
    delete headers["x-real-ip"];
    return headers;
  }

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
    const headers = {
      ...req.headers,
      host: `${LICENSE_PROXY_HOST}:${LICENSE_PROXY_PORT}`,
    };
    headers["x-forwarded-proto"] = forwardedProto(req);
    headers["x-forwarded-for"] = clientIp;
    headers["x-real-ip"] = clientIp;
    return headers;
  }

  function daemonProxyHeaders(req) {
    const headers = {
      ...req.headers,
      host: `${DAEMON_PROXY_HOST}:${DAEMON_PROXY_PORT}`,
    };
    headers["x-forwarded-proto"] = forwardedProto(req);
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
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
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
      socket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\nConnection: close\r\n\r\n`);
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
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
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
      socket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\nConnection: close\r\n\r\n`);
      res.pipe(socket);
    });
    if (head?.length) proxyReq.write(head);
    proxyReq.end();
  }

  return {
    requestHost,
    isLicenseHost,
    isDaemonHost,
    proxyLicenseHttp,
    proxyDaemonHttp,
    proxyDaemonWs,
    proxyHttp,
    proxyWs,
  };
}
