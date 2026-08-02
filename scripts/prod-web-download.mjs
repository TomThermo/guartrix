/**
 * Operator-only password-gated /download for release zips.
 * Not copied into customer release packages (see lib-stage-release.sh).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DOWNLOAD_PASSWORD = process.env.DOWNLOAD_PASSWORD?.trim() || "";
const DOWNLOAD_COOKIE = "guartrix_dl";
const DOWNLOAD_TTL_SEC = Math.max(
  3600,
  Number(process.env.DOWNLOAD_SESSION_TTL_SEC || 7 * 24 * 3600) || 7 * 24 * 3600,
);
const DOWNLOAD_SIGNING_SECRET =
  process.env.DOWNLOAD_COOKIE_SECRET?.trim() ||
  process.env.SESSION_SECRET?.trim() ||
  DOWNLOAD_PASSWORD ||
  "guartrix-download";

function downloadDir(rootDir) {
  const raw = process.env.DOWNLOAD_DIR?.trim();
  if (!raw) return path.join(rootDir, "data", "downloads");
  return path.isAbsolute(raw) ? raw : path.resolve(rootDir, raw);
}

function downloadEnabled() {
  return (
    process.env.DOWNLOAD_ENABLED !== "0" &&
    process.env.DOWNLOAD_ENABLED !== "false" &&
    Boolean(DOWNLOAD_PASSWORD)
  );
}

export function logDownloadStatus(rootDir) {
  if (!downloadEnabled()) return;
  console.log(
    `[guartrix] Password downloads → /download (dir ${downloadDir(rootDir)})`,
  );
}

function safeEqualString(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(
      ba.length ? ba : Buffer.alloc(1),
      ba.length ? ba : Buffer.alloc(1),
    );
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function signDownloadToken(expUnix) {
  const payload = `v1.${expUnix}`;
  const sig = crypto
    .createHmac("sha256", DOWNLOAD_SIGNING_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifyDownloadToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return safeEqualString(token, signDownloadToken(exp));
}

function hasDownloadAccess(req) {
  if (!downloadEnabled()) return false;
  return verifyDownloadToken(parseCookies(req)[DOWNLOAD_COOKIE]);
}

function downloadSetCookieHeader(token, httpsEnabled) {
  const secure =
    process.env.SESSION_SECURE === "true" ||
    process.env.SESSION_SECURE === "1" ||
    httpsEnabled;
  const parts = [
    `${DOWNLOAD_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/download",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${DOWNLOAD_TTL_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function readDownloadManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function listDownloadFiles(dir) {
  const manifest = readDownloadManifest(dir);
  if (manifest?.parts || manifest?.master) {
    const files = [];
    if (manifest.master?.name) files.push(manifest.master);
    for (const p of manifest.parts || []) files.push(p);
    for (const extra of manifest.extras || []) files.push(extra);
    const latest = "guartrix-bundle-latest.zip";
    if (fs.existsSync(path.join(dir, latest))) {
      files.unshift({
        name: latest,
        bytes: fs.statSync(path.join(dir, latest)).size,
        label: "Latest full bundle (recommended)",
      });
    }
    // Always surface env templates when present (even if an older manifest omits extras)
    for (const [name, label] of [
      ["guartrix.env.example", "Panel .env.example"],
      ["daemon.env.example", "Daemon data/daemon.env.example"],
      ["license.env.example", "License server data/license.env.example"],
    ]) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      files.push({
        name,
        bytes: fs.statSync(p).size,
        label,
      });
    }
    const seen = new Set();
    return files.filter((f) => {
      if (!f?.name || seen.has(f.name)) return false;
      seen.add(f.name);
      return fs.existsSync(path.join(dir, f.name));
    });
  }
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => /\.(zip|example)$/i.test(n))
      .sort()
      .map((name) => ({
        name,
        bytes: fs.statSync(path.join(dir, name)).size,
      }));
  } catch {
    return [];
  }
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "";
  const u = ["B", "KiB", "MiB", "GiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadPageHtml({ unlocked, error, files, version }) {
  const list =
    unlocked && files.length
      ? `<ul class="files">${files
          .map(
            (f) =>
              `<li><a href="/download/files/${encodeURIComponent(f.name)}">${escapeHtml(f.label || f.name)}</a>` +
              (f.bytes != null
                ? ` <span class="meta">${escapeHtml(formatBytes(f.bytes))}</span>`
                : "") +
              `</li>`,
          )
          .join("")}</ul>`
      : unlocked
        ? `<p class="muted">No packages published yet. Run <code>bash scripts/package-download-bundle.sh</code> on the host.</p>`
        : "";
  const form = unlocked
    ? `<form method="post" action="/download/logout" class="row"><button type="submit">Lock downloads</button></form>`
    : `<form method="post" action="/download" class="box">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
        <button type="submit">Unlock</button>
      </form>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Guartrix downloads</title>
  <style>
    :root { color-scheme: light dark; --bg:#0f1419; --fg:#e8eef4; --muted:#8b9aab; --line:#243041; --accent:#3d8bfd; --err:#e35d6a; --card:#171e27; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; background:
      radial-gradient(1200px 600px at 10% -10%, #1a2a3d 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #1c2430 0%, transparent 50%),
      var(--bg); color: var(--fg); }
    main { max-width: 40rem; margin: 0 auto; padding: 4rem 1.25rem 3rem; }
    h1 { font-family: "IBM Plex Serif", Georgia, serif; font-weight: 600; font-size: clamp(1.8rem, 4vw, 2.4rem); letter-spacing: -0.02em; margin: 0 0 0.35rem; }
    .lead { color: var(--muted); margin: 0 0 1.75rem; line-height: 1.5; }
    .box { display: grid; gap: 0.65rem; padding: 1.25rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
    label { font-size: 0.85rem; color: var(--muted); }
    input { width: 100%; padding: 0.7rem 0.8rem; border-radius: 8px; border: 1px solid var(--line); background: #0c1117; color: var(--fg); font-size: 1rem; }
    button { appearance: none; border: 0; border-radius: 8px; padding: 0.7rem 1rem; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
    .err { color: var(--err); margin: 0 0 1rem; }
    .files { list-style: none; padding: 0; margin: 0 0 1.5rem; display: grid; gap: 0.55rem; }
    .files li { padding: 0.85rem 1rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
    .files a { color: var(--fg); font-weight: 600; text-decoration: none; }
    .meta { color: var(--muted); font-size: 0.85rem; }
    .muted { color: var(--muted); }
    code { font-family: ui-monospace, Menlo, monospace; font-size: 0.85em; }
    .row { margin-top: 1rem; }
  </style>
</head>
<body>
  <main>
    <h1>Downloads</h1>
    <p class="lead">Release packages${version ? ` · ${escapeHtml(version)}` : ""}. Password required. Env templates are listed after unlock.</p>
    ${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
    ${list}
    ${form}
  </main>
</body>
</html>`;
}

function readRequestBody(req, limit = 64_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseFormBody(raw) {
  const out = {};
  for (const part of String(raw || "").split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent(
      (i >= 0 ? part.slice(0, i) : part).replace(/\+/g, " "),
    );
    const v = decodeURIComponent(
      (i >= 0 ? part.slice(i + 1) : "").replace(/\+/g, " "),
    );
    out[k] = v;
  }
  return out;
}

export async function handleDownload(req, res, ctx) {
  const { rootDir, httpsEnabled, safeJoin } = ctx;
  const dir = downloadDir(rootDir);
  if (!downloadEnabled()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/download/logout" && req.method === "POST") {
    res.writeHead(302, {
      Location: "/download",
      "Set-Cookie": `${DOWNLOAD_COOKIE}=; Path=/download; HttpOnly; SameSite=Lax; Max-Age=0`,
    });
    res.end();
    return;
  }

  if (pathname === "/download" && req.method === "POST") {
    let raw = "";
    try {
      raw = await readRequestBody(req);
    } catch {
      res.statusCode = 413;
      res.end("Payload too large");
      return;
    }
    const form = parseFormBody(raw);
    if (!safeEqualString(form.password || "", DOWNLOAD_PASSWORD)) {
      const html = downloadPageHtml({
        unlocked: false,
        error: "Incorrect password",
        files: [],
        version: readDownloadManifest(dir)?.version,
      });
      res.writeHead(401, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SEC;
    res.writeHead(302, {
      Location: "/download",
      "Set-Cookie": downloadSetCookieHeader(signDownloadToken(exp), httpsEnabled),
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (pathname.startsWith("/download/files/")) {
    if (!hasDownloadAccess(req)) {
      res.writeHead(302, { Location: "/download", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    const name = decodeURIComponent(pathname.slice("/download/files/".length));
    // Zips + env templates only (no path traversal; no leading dots)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|example)$/i.test(name)) {
      res.statusCode = 400;
      res.end("Bad filename");
      return;
    }
    const filePath = safeJoin(dir, name);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const st = fs.statSync(filePath);
    const isZip = /\.zip$/i.test(name);
    res.writeHead(200, {
      "Content-Type": isZip ? "application/zip" : "text/plain; charset=utf-8",
      "Content-Length": st.size,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (pathname === "/download" && (req.method === "GET" || req.method === "HEAD")) {
    const unlocked = hasDownloadAccess(req);
    const manifest = readDownloadManifest(dir);
    const html = downloadPageHtml({
      unlocked,
      error: "",
      files: unlocked ? listDownloadFiles(dir) : [],
      version: manifest?.version,
    });
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(html),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(html);
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
}
