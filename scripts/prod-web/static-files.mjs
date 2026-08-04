import fs from "node:fs";
import path from "node:path";

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

export function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function safeJoin(root, urlPath) {
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

export function sendFile(res, filePath) {
  const st = fs.statSync(filePath);
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = filePath.endsWith("index.html");
  const isSocialPreview =
    base === "og.jpg" || base === "og.png" || base === "favicon.ico";
  const isVersionedAsset = ext === ".wasm";
  const cacheControl = isHtml
    ? "no-store, no-cache, must-revalidate"
    : isSocialPreview || isVersionedAsset
      ? "public, max-age=3600"
      : "public, max-age=31536000, immutable";

  if (isHtml && res.cspNonce) {
    let html = fs.readFileSync(filePath, "utf8");
    const nonceAttr = ` nonce="${res.cspNonce}"`;
    html = html.replace(/<script(?![^>]*\bnonce=)/gi, `<script${nonceAttr}`);
    const body = Buffer.from(html, "utf8");
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Content-Length": body.length,
      "Cache-Control": cacheControl,
    });
    res.end(body);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": st.size,
    "Cache-Control": cacheControl,
  });
  fs.createReadStream(filePath).pipe(res);
}
