import fs from "node:fs";
import path from "node:path";
import { resolveDaemonBundle } from "./daemon-bundle.mjs";

/** True for `/api` and `/api/…`, but not `/api-docs` (SPA docs product). */
export function isPanelApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Route HTTP requests: proxy, install scripts, /download, static SPA. */
export function createRequestRouter(config, proxy, staticFiles, loadDownloadApi) {
  const { rootDir, HTTPS_ENABLED, PUBLIC_HOST, DOWNLOAD_PUBLIC_HOST, DIST } = config;
  const { safeJoin, sendFile } = staticFiles;
  const {
    requestHost,
    isLicenseHost,
    isDaemonHost,
    proxyLicenseHttp,
    proxyDaemonHttp,
    proxyHttp,
    proxyWs,
    proxyDaemonWs,
  } = proxy;

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
    if (isPanelApiPath(url) || url.startsWith("/ws")) {
      proxyHttp(req, res);
      return;
    }

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

    // Prebuilt daemon zip for remote nodes (avoids `tsc` OOM on small VPS). No download password.
    if (url === "/install-daemon-bundle.zip") {
      const resolved = resolveDaemonBundle(rootDir);
      if (!resolved?.zipPath) {
        res.statusCode = 404;
        res.end("Daemon bundle not found — run panel build/package first");
        return;
      }
      const body = fs.readFileSync(resolved.zipPath);
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="guartrix-daemon-bundle.zip"',
      });
      res.end(body);
      if (resolved.cleanupDir) {
        try {
          fs.rmSync(resolved.cleanupDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (url === "/download" || url.startsWith("/download/")) {
      if (
        DOWNLOAD_PUBLIC_HOST &&
        requestHost(req) !== DOWNLOAD_PUBLIC_HOST &&
        requestHost(req) !== "127.0.0.1" &&
        requestHost(req) !== "localhost"
      ) {
        const target = `https://${DOWNLOAD_PUBLIC_HOST}${url}`;
        res.writeHead(302, { Location: target, "Cache-Control": "no-store" });
        res.end();
        return;
      }
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

    if (DOWNLOAD_PUBLIC_HOST && requestHost(req) === DOWNLOAD_PUBLIC_HOST) {
      res.writeHead(302, {
        Location: `https://${PUBLIC_HOST}/`,
        "Cache-Control": "no-store",
      });
      res.end();
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
      sendFile(res, filePath, req);
      return;
    }

    sendFile(res, path.join(DIST, "index.html"), req);
  }

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
      const pathOnly = url.split("?")[0] || "/";
      if (url.startsWith("/ws") || isPanelApiPath(pathOnly)) {
        proxyWs(req, socket, head);
        return;
      }
      socket.destroy();
    } catch (err) {
      console.error("[guartrix] upgrade handler error:", err);
      socket.destroy();
    }
  }

  return { handleRequest, handleUpgrade };
}
