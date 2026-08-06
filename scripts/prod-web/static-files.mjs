import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream";

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

/** Extensions worth compressing (text-like). Skip already-compressed formats. */
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".map",
  ".xml",
  ".wasm",
]);

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

function preferEncoding(acceptEncoding) {
  const ae = String(acceptEncoding || "").toLowerCase();
  if (ae.includes("br")) return "br";
  if (ae.includes("gzip")) return "gzip";
  return null;
}

function weakEtag(st) {
  return `W/"${st.size.toString(16)}-${Math.trunc(st.mtimeMs).toString(16)}"`;
}

/**
 * @param {import('node:http').ServerResponse & { cspNonce?: string }} res
 * @param {string} filePath
 * @param {import('node:http').IncomingMessage} [req]
 */
export function sendFile(res, filePath, req) {
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

  const etag = weakEtag(st);
  const inm = req?.headers?.["if-none-match"];
  if (inm && String(inm) === etag && !isHtml) {
    res.writeHead(304, {
      ETag: etag,
      "Cache-Control": cacheControl,
    });
    res.end();
    return;
  }

  const encoding =
    !isHtml && COMPRESSIBLE.has(ext)
      ? preferEncoding(req?.headers?.["accept-encoding"])
      : null;

  if (isHtml && res.cspNonce) {
    let html = fs.readFileSync(filePath, "utf8");
    const nonceAttr = ` nonce="${res.cspNonce}"`;
    html = html.replace(/<script(?![^>]*\bnonce=)/gi, `<script${nonceAttr}`);
    let body = Buffer.from(html, "utf8");
    const headers = {
      "Content-Type": contentType(filePath),
      "Cache-Control": cacheControl,
      Vary: "Accept-Encoding",
    };
    const htmlEnc = preferEncoding(req?.headers?.["accept-encoding"]);
    if (htmlEnc === "br") {
      body = zlib.brotliCompressSync(body, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
      });
      headers["Content-Encoding"] = "br";
    } else if (htmlEnc === "gzip") {
      body = zlib.gzipSync(body, { level: 6 });
      headers["Content-Encoding"] = "gzip";
    }
    headers["Content-Length"] = body.length;
    res.writeHead(200, headers);
    res.end(body);
    return;
  }

  // Prefer precompressed siblings produced at build time when present.
  if (encoding === "br" && fs.existsSync(`${filePath}.br`)) {
    const brSt = fs.statSync(`${filePath}.br`);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Content-Length": brSt.size,
      "Content-Encoding": "br",
      "Cache-Control": cacheControl,
      ETag: etag,
      Vary: "Accept-Encoding",
    });
    fs.createReadStream(`${filePath}.br`).pipe(res);
    return;
  }
  if (encoding === "gzip" && fs.existsSync(`${filePath}.gz`)) {
    const gzSt = fs.statSync(`${filePath}.gz`);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Content-Length": gzSt.size,
      "Content-Encoding": "gzip",
      "Cache-Control": cacheControl,
      ETag: etag,
      Vary: "Accept-Encoding",
    });
    fs.createReadStream(`${filePath}.gz`).pipe(res);
    return;
  }

  if (encoding === "br" || encoding === "gzip") {
    const headers = {
      "Content-Type": contentType(filePath),
      "Content-Encoding": encoding,
      "Cache-Control": cacheControl,
      ETag: etag,
      Vary: "Accept-Encoding",
    };
    res.writeHead(200, headers);
    const raw = fs.createReadStream(filePath);
    const transform =
      encoding === "br"
        ? zlib.createBrotliCompress({
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
          })
        : zlib.createGzip({ level: 6 });
    pipeline(raw, transform, res, () => {
      /* client disconnect / stream end */
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": st.size,
    "Cache-Control": cacheControl,
    ETag: etag,
  });
  fs.createReadStream(filePath).pipe(res);
}
