import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const MAX_LOGO_BYTES = 512 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function brandingDir(): string {
  return path.join(config.dataDir, "branding");
}

function detectExt(buffer: Buffer, filename: string, mimeType: string): string | null {
  const fromMime = EXT_BY_MIME[mimeType.toLowerCase()];
  if (fromMime) return fromMime;
  const nameExt = path.extname(filename).replace(/^\./, "").toLowerCase();
  if (nameExt === "jpeg") return "jpg";
  if (nameExt in MIME_BY_EXT) return nameExt;
  // Magic bytes
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function publicBrandingLogoPath(): string {
  return "/api/public/branding/logo";
}

export function isManagedBrandingLogoUrl(url: string): boolean {
  const raw = String(url ?? "").trim();
  if (!raw) return false;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      return u.pathname === publicBrandingLogoPath() || u.pathname.endsWith(publicBrandingLogoPath());
    }
  } catch {
    /* fall through */
  }
  return raw === publicBrandingLogoPath() || raw.startsWith(`${publicBrandingLogoPath()}?`);
}

export function brandingLogoPublicUrl(mtimeMs?: number): string {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const v = mtimeMs ?? Date.now();
  return `${base}${publicBrandingLogoPath()}?v=${Math.floor(v)}`;
}

export function findBrandingLogoFile(): { filePath: string; ext: string; mime: string } | null {
  const dir = brandingDir();
  if (!fs.existsSync(dir)) return null;
  for (const ext of Object.keys(MIME_BY_EXT)) {
    if (ext === "jpeg") continue;
    const filePath = path.join(dir, `logo.${ext}`);
    if (fs.existsSync(filePath)) {
      return { filePath, ext, mime: MIME_BY_EXT[ext] };
    }
  }
  return null;
}

export function hasBrandingLogoFile(): boolean {
  return findBrandingLogoFile() !== null;
}

export async function saveBrandingLogo(opts: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<{ appLogo: string; ext: string; bytes: number }> {
  const { buffer, filename, mimeType } = opts;
  if (!buffer.length) throw new Error("Empty file");
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error("Logo too large (max 512 KB)");
  }
  const ext = detectExt(buffer, filename, mimeType);
  if (!ext) {
    throw new Error("Unsupported image type — use PNG, JPEG, GIF, or WebP");
  }

  const dir = brandingDir();
  await fsPromises.mkdir(dir, { recursive: true });

  // Remove previous extension variants so only one logo.* remains.
  for (const oldExt of Object.keys(MIME_BY_EXT)) {
    if (oldExt === "jpeg") continue;
    await fsPromises.rm(path.join(dir, `logo.${oldExt}`), { force: true });
  }

  const dest = path.join(dir, `logo.${ext}`);
  await fsPromises.writeFile(dest, buffer);
  const st = await fsPromises.stat(dest);
  return {
    appLogo: brandingLogoPublicUrl(st.mtimeMs),
    ext,
    bytes: buffer.length,
  };
}

export async function deleteBrandingLogo(): Promise<boolean> {
  const found = findBrandingLogoFile();
  if (!found) return false;
  await fsPromises.rm(found.filePath, { force: true });
  return true;
}

export async function readBrandingLogo(): Promise<{
  buffer: Buffer;
  mime: string;
  mtimeMs: number;
} | null> {
  const found = findBrandingLogoFile();
  if (!found) return null;
  const [buffer, st] = await Promise.all([
    fsPromises.readFile(found.filePath),
    fsPromises.stat(found.filePath),
  ]);
  return { buffer, mime: found.mime, mtimeMs: st.mtimeMs };
}
