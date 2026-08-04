import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { PurgeCSS } from "purgecss";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webDir = path.dirname(fileURLToPath(import.meta.url));

function loadFaSafelist(): string[] {
  try {
    const raw = fs.readFileSync(path.join(webDir, "fa-safelist.json"), "utf8");
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function walkSrc(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSrc(p, out);
    else if (/\.(tsx?|jsx?|html)$/.test(ent.name)) out.push(p);
  }
  return out;
}

/** Production-only: drop unused Font Awesome solid glyph rules. */
function faSubsetPlugin(): Plugin {
  return {
    name: "fa-subset",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const safelist = [
        ...loadFaSafelist(),
        "fa-solid",
        "fa-fw",
        "fa-spin",
        "fa-2x",
        "fa-lg",
      ];
      const content = walkSrc(path.join(webDir, "src")).map((file) => ({
        raw: fs.readFileSync(file, "utf8"),
        extension: path.extname(file).slice(1),
      }));
      content.push({
        raw: fs.readFileSync(path.join(webDir, "index.html"), "utf8"),
        extension: "html",
      });

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "asset" || !chunk.fileName.endsWith(".css")) continue;
        if (typeof chunk.source !== "string") continue;
        if (!chunk.source.includes(".fa-solid") || !chunk.source.includes("Font Awesome")) {
          continue;
        }
        const purged = await new PurgeCSS().purge({
          content,
          css: [{ raw: chunk.source, name: chunk.fileName }],
          safelist: { standard: safelist },
          fontFace: true,
        });
        const next = purged[0]?.css;
        if (next && next.length < chunk.source.length) {
          chunk.source = next;
        }
      }
    },
  };
}

function readApiPort(): string {
  if (process.env.VITE_API_PORT) return process.env.VITE_API_PORT;
  if (process.env.API_PORT) return process.env.API_PORT;
  try {
    const raw = fs.readFileSync(path.join(rootDir, ".env"), "utf8");
    const m = /^API_PORT=(.+)$/m.exec(raw);
    if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
  } catch {
    // ignore
  }
  return "3001";
}

const API_HOST = "127.0.0.1";
const API_PORT = Number(readApiPort());

function backupTransferProxyPlugin(): Plugin {
  const uploadChunk =
    /^\/api\/servers\/[^/]+\/backups\/upload\/[^/]+\/chunks\/\d+(?:\?|$)/;
  const backupDownload =
    /^\/api\/servers\/[^/]+\/backups\/[^/]+\/download(?:\?|$)/;

  function pipeToApi(req: IncomingMessage, res: ServerResponse): void {
    const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };
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
        res.end(`Backup transfer proxy error: ${err.message}`);
      } else {
        res.destroy(err);
      }
    });
    req.on("aborted", () => {
      proxyReq.destroy();
    });
    req.pipe(proxyReq);
  }

  return {
    name: "backup-transfer-stream-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const method = (req.method ?? "GET").toUpperCase();
        if (method === "PUT" && uploadChunk.test(url)) {
          pipeToApi(req, res);
          return;
        }
        if (
          (method === "GET" || method === "HEAD") &&
          backupDownload.test(url)
        ) {
          pipeToApi(req, res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, rootDir, "");
  const apiPort = readApiPort();

  return {
    plugins: [react(), backupTransferProxyPlugin(), faSubsetPlugin()],
    define: {
      "import.meta.env.VITE_API_PORT": JSON.stringify(apiPort),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://${API_HOST}:${API_PORT}`,
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
          agent: new http.Agent({ keepAlive: true, maxSockets: 32 }),
        },
        "/ws": {
          target: `ws://${API_HOST}:${API_PORT}`,
          ws: true,
        },
      },
    },
  };
});
