import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webDir = path.dirname(fileURLToPath(import.meta.url));

function readProductVersion(): string {
  try {
    const fromFile = fs.readFileSync(path.join(rootDir, "VERSION"), "utf8").trim().split(/\s/)[0];
    if (fromFile) return fromFile;
  } catch {
    /* fall through */
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(webDir, "package.json"), "utf8")) as {
      version?: string;
    };
    if (pkg.version?.trim()) return pkg.version.trim();
  } catch {
    /* fall through */
  }
  return "0.0.0";
}

function loadFaSafelist(): string[] {
  try {
    const raw = fs.readFileSync(path.join(webDir, "fa-safelist.json"), "utf8");
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Drop unused FA7 glyph rules without touching Bootstrap/app CSS.
 * FA7 often groups aliases: `.fa-user,.fa-user-alt,.fa-user-large{--fa:"…"}`.
 * Matching only the last `.fa-*{` corrupts selectors (orphans merge into the
 * next rule and steal the wrong glyph). Keep whole groups, then trim to
 * safelisted class names.
 */
function subsetFaGlyphRules(css: string, keep: Set<string>): string {
  return css.replace(/(?:\.fa-[a-z0-9-]+\s*,\s*)*\.fa-[a-z0-9-]+\s*\{--fa:[^}]+\}/g, (rule) => {
    const classes = [...rule.matchAll(/\.fa-([a-z0-9-]+)/g)].map((m) => `fa-${m[1]}`);
    const kept = [...new Set(classes.filter((c) => keep.has(c)))];
    if (kept.length === 0) return "";
    const faBody = /\{--fa:[^}]+\}/.exec(rule)?.[0];
    if (!faBody) return "";
    return kept.map((c) => `.${c}`).join(",") + faBody;
  });
}

/** Production-only: drop unused Font Awesome solid glyph rules before hashing. */
function faSubsetPlugin(): Plugin {
  const keep = new Set([...loadFaSafelist(), "fa-solid", "fa-fw", "fa-spin", "fa-2x", "fa-lg"]);

  return {
    name: "fa-subset",
    apply: "build",
    // Transform FA CSS modules so the emitted asset hash matches subset output
    // (generateBundle mutations keep the old hash and stick clients on stale CSS).
    transform(code, id) {
      const norm = id.replace(/\\/g, "/");
      if (!norm.includes("@fortawesome/fontawesome-free")) return null;
      if (!norm.endsWith(".css")) return null;
      if (!code.includes("--fa:")) return null;
      const next = subsetFaGlyphRules(code, keep);
      if (next === code) return null;
      return { code: next, map: null };
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
  const uploadChunk = /^\/api\/servers\/[^/]+\/backups\/upload\/[^/]+\/chunks\/\d+(?:\?|$)/;
  const backupDownload = /^\/api\/servers\/[^/]+\/backups\/[^/]+\/download(?:\?|$)/;

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
        if ((method === "GET" || method === "HEAD") && backupDownload.test(url)) {
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
  const appVersion = readProductVersion();

  return {
    plugins: [react(), backupTransferProxyPlugin(), faSubsetPlugin()],
    define: {
      "import.meta.env.VITE_API_PORT": JSON.stringify(apiPort),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    optimizeDeps: {
      include: ["monaco-editor", "@monaco-editor/react"],
    },
    worker: {
      format: "es",
    },
    build: {
      // Monaco’s ESM graph is huge; default parallel file ops OOMs ~4 GiB hosts.
      reportCompressedSize: false,
      sourcemap: false,
      rollupOptions: {
        maxParallelFileOps: 2,
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
              return "monaco";
            }
            if (id.includes("react-bootstrap") || id.includes("/bootstrap/")) {
              return "bootstrap";
            }
            if (
              id.includes("/react-dom/") ||
              id.includes("/react/") ||
              id.includes("/scheduler/")
            ) {
              return "react-vendor";
            }
          },
        },
      },
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
          bypass(req) {
            const url = req.url?.split("?")[0] ?? "";
            // Vite matches prefix `/api`, which would steal `/api-docs`.
            if (url === "/api-docs" || url.startsWith("/api-docs/")) return url;
          },
        },
        "/ws": {
          target: `ws://${API_HOST}:${API_PORT}`,
          ws: true,
        },
      },
    },
  };
});
