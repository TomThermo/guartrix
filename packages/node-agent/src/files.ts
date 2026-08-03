import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { safeExtractArchive } from "./safe-archive.js";
import { serverDir } from "./config.js";
import { fixDataOwnership } from "./process-manager.js";
import {
  assertDiskSpace,
  invalidateServerDataCache,
} from "./disk-quota.js";

const TEXT_MAX_BYTES = 2 * 1024 * 1024;
/** Keep in sync with @msm/shared FILE_UPLOAD_MAX_BYTES (2 GiB). */
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".yml",
  ".yaml",
  ".json",
  ".properties",
  ".toml",
  ".cfg",
  ".conf",
  ".ini",
  ".log",
  ".md",
  ".xml",
  ".csv",
  ".sh",
  ".bat",
  ".gitignore",
  ".env",
]);

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt: string;
  editable: boolean;
}

function normalizeRelative(rel: string): string {
  const cleaned = (rel || ".")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned || cleaned === ".") return ".";
  const parts = cleaned.split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) {
    throw new Error("Invalid path");
  }
  return parts.join("/") || ".";
}

function isInsideRoot(rootReal: string, candidateReal: string): boolean {
  return (
    candidateReal === rootReal ||
    candidateReal.startsWith(rootReal + path.sep)
  );
}

/**
 * Resolve a path under the server directory.
 * Rejects `..` and any symlink in the path (prevents jail escapes).
 */
export function resolveSafePath(serverId: string, rel: string): {
  absolute: string;
  relative: string;
  root: string;
} {
  const rootRaw = path.resolve(serverDir(serverId));
  fsSync.mkdirSync(rootRaw, { recursive: true });
  const root = fsSync.realpathSync(rootRaw);
  const relative = normalizeRelative(rel);

  // Walk each component; refuse symlinks so targets outside the jail cannot be followed.
  let cursor = root;
  if (relative !== ".") {
    for (const part of relative.split("/")) {
      cursor = path.join(cursor, part);
      let st: fsSync.Stats;
      try {
        st = fsSync.lstatSync(cursor);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          // Remaining path is being created — parent was already validated.
          break;
        }
        throw err;
      }
      if (st.isSymbolicLink()) {
        throw new Error("Symlinks are not allowed in server files");
      }
    }
  }

  const absolute =
    relative === "." ? root : path.resolve(root, relative);

  const relToRoot = path.relative(root, absolute);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    throw new Error("Path escapes server directory");
  }

  if (fsSync.existsSync(absolute)) {
    const real = fsSync.realpathSync(absolute);
    if (!isInsideRoot(root, real)) {
      throw new Error("Path escapes server directory");
    }
  }

  return {
    absolute,
    relative: relative === "." ? "" : relative,
    root,
  };
}

const SENSITIVE_NAMES = new Set([
  "guartrix-addons.json",
  "guartrix-resource-pack.json",
  "guartrix-scheduled-tasks.json",
  "guartrix-player-history.json",
  "guartrix-console-history.json",
  "guartrix-limits.json",
  // Legacy BlockHost filenames (kept protected until migrated)
  "blockhost-addons.json",
  "blockhost-resource-pack.json",
  "blockhost-scheduled-tasks.json",
  "blockhost-player-history.json",
  "blockhost-console-history.json",
]);

export function isSensitiveFileName(name: string): boolean {
  const base = path.basename(name);
  const lower = base.toLowerCase();
  return (
    SENSITIVE_NAMES.has(base) ||
    SENSITIVE_NAMES.has(lower) ||
    lower.startsWith("guartrix-") ||
    lower.startsWith("blockhost-")
  );
}

function assertNotSensitive(relPath: string): void {
  if (isSensitiveFileName(relPath)) {
    throw new Error("This Guartrix control file cannot be edited here");
  }
}

function isEditableName(name: string, size: number): boolean {
  if (size > TEXT_MAX_BYTES) return false;
  if (SENSITIVE_NAMES.has(name)) return false;
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // common MC files without extension
  return ["eula.txt", "ops.json", "whitelist.json", "banned-players.json", "banned-ips.json"].includes(
    name,
  );
}

export async function listFiles(
  serverId: string,
  relPath: string,
): Promise<{ path: string; entries: FileEntry[] }> {
  const { absolute, relative } = resolveSafePath(serverId, relPath);
  const stat = await fs.stat(absolute);
  if (!stat.isDirectory()) {
    throw new Error("Not a directory");
  }

  const names = await fs.readdir(absolute);
  const entries: FileEntry[] = [];

  for (const name of names) {
    if (name === "." || name === "..") continue;
    if (SENSITIVE_NAMES.has(name) || isSensitiveFileName(name)) continue;
    const full = path.join(absolute, name);
    try {
      const lst = await fs.lstat(full);
      if (lst.isSymbolicLink()) continue; // never expose / follow symlinks
      const st = lst;
      const childRel = relative ? `${relative}/${name}` : name;
      entries.push({
        name,
        path: childRel,
        type: st.isDirectory() ? "dir" : "file",
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
        editable: st.isFile() && isEditableName(name, st.size),
      });
    } catch {
      // skip inaccessible
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { path: relative, entries };
}

export async function readFileContent(
  serverId: string,
  relPath: string,
): Promise<{ path: string; content: string; editable: boolean }> {
  const { absolute, relative } = resolveSafePath(serverId, relPath);
  if (!relative) throw new Error("Select a file");
  assertNotSensitive(relative);
  const st = await fs.lstat(absolute);
  if (st.isSymbolicLink()) {
    throw new Error("Symlinks are not allowed in server files");
  }
  if (!st.isFile()) throw new Error("Not a file");
  if (st.size > TEXT_MAX_BYTES) {
    throw new Error("File too large to edit in the panel (max 2 MB)");
  }
  const buf = await fs.readFile(absolute);
  // Reject obvious binary
  if (buf.includes(0)) {
    throw new Error("Binary files cannot be edited as text");
  }
  return {
    path: relative,
    content: buf.toString("utf8"),
    editable: true,
  };
}

export async function writeFileContent(
  serverId: string,
  relPath: string,
  content: string,
): Promise<void> {
  await fixDataOwnership(serverDir(serverId));
  const { absolute, relative } = resolveSafePath(serverId, relPath);
  if (!relative) throw new Error("Invalid file path");
  assertNotSensitive(relative);
  const newSize = Buffer.byteLength(content, "utf8");
  if (newSize > TEXT_MAX_BYTES) {
    throw new Error("Content too large (max 2 MB)");
  }
  let oldSize = 0;
  try {
    const st = await fs.lstat(absolute);
    if (st.isFile()) oldSize = st.size;
  } catch {
    // new file
  }
  await assertDiskSpace(serverId, newSize - oldSize);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  // Prefer O_NOFOLLOW so a raced symlink cannot redirect the write.
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_TRUNC |
    (fs.constants.O_NOFOLLOW ?? 0);
  try {
    const fh = await fs.open(absolute, flags, 0o644);
    try {
      await fh.writeFile(content, "utf8");
    } finally {
      await fh.close();
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") {
      throw new Error("Symlinks are not allowed in server files");
    }
    throw err;
  }
  invalidateServerDataCache(serverId);
}

export async function createDirectory(
  serverId: string,
  relPath: string,
): Promise<void> {
  await fixDataOwnership(serverDir(serverId));
  const { absolute, relative } = resolveSafePath(serverId, relPath);
  if (!relative) throw new Error("Invalid directory path");
  await fs.mkdir(absolute, { recursive: true });
}

export async function deletePath(
  serverId: string,
  relPath: string,
): Promise<void> {
  await fixDataOwnership(serverDir(serverId));
  const { absolute, relative } = resolveSafePath(serverId, relPath);
  if (!relative) throw new Error("Cannot delete server root");
  assertNotSensitive(relative);
  await fs.rm(absolute, { recursive: true, force: true });
}

export async function renamePath(
  serverId: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  await fixDataOwnership(serverDir(serverId));
  const from = resolveSafePath(serverId, fromRel);
  const to = resolveSafePath(serverId, toRel);
  if (!from.relative || !to.relative) throw new Error("Invalid path");
  assertNotSensitive(from.relative);
  assertNotSensitive(to.relative);
  await fs.mkdir(path.dirname(to.absolute), { recursive: true });
  await fs.rename(from.absolute, to.absolute);
}

export async function saveUpload(
  serverId: string,
  relDir: string,
  fileName: string,
  stream: Readable,
): Promise<{ path: string; size: number }> {
  await fixDataOwnership(serverDir(serverId));
  const safeName = path.basename(fileName).replace(/[^\w.\- ()[\]]+/g, "_");
  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error("Invalid file name");
  }
  if (SENSITIVE_NAMES.has(safeName)) {
    throw new Error("Cannot upload over Guartrix control files");
  }
  // Block host-level executables / archives that aren't typical MC content
  const lower = safeName.toLowerCase();
  if (
    lower.endsWith(".php") ||
    lower.endsWith(".phtml") ||
    lower.endsWith(".asp") ||
    lower.endsWith(".aspx") ||
    lower.endsWith(".cgi") ||
    lower.endsWith(".exe") ||
    lower.endsWith(".dll") ||
    lower.endsWith(".so") ||
    lower.endsWith(".dylib")
  ) {
    throw new Error("This file type is not allowed");
  }
  const dir = resolveSafePath(serverId, relDir || ".");
  if (!(await fs.stat(dir.absolute)).isDirectory()) {
    throw new Error("Upload target is not a directory");
  }
  const destRel = dir.relative ? `${dir.relative}/${safeName}` : safeName;
  const dest = resolveSafePath(serverId, destRel);
  // Fail fast when already at/over quota (Wings HasSpaceAvailable)
  await assertDiskSpace(serverId, 1);
  // Reject raced symlinks (same as writeFile): O_NOFOLLOW + replace existing file.
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_TRUNC |
    (fs.constants.O_NOFOLLOW ?? 0);
  let fh: Awaited<ReturnType<typeof fs.open>>;
  try {
    // resolveSafePath already rejects symlink path components; still use O_NOFOLLOW.
    try {
      const st = await fs.lstat(dest.absolute);
      if (st.isSymbolicLink()) {
        throw new Error("Symlinks are not allowed in server files");
      }
      if (st.isDirectory()) {
        throw new Error("Upload target is a directory");
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    fh = await fs.open(dest.absolute, flags, 0o600);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") {
      throw new Error("Symlinks are not allowed in server files");
    }
    throw err;
  }
  try {
    await pipeline(stream, fh.createWriteStream());
  } finally {
    await fh.close().catch(() => undefined);
  }
  const st = await fs.lstat(dest.absolute);
  if (st.isSymbolicLink()) {
    await fs.rm(dest.absolute, { force: true }).catch(() => undefined);
    throw new Error("Symlinks are not allowed in server files");
  }
  if (st.size > UPLOAD_MAX_BYTES) {
    await fs.rm(dest.absolute, { force: true });
    invalidateServerDataCache(serverId);
    throw new Error(
      `File exceeds upload limit (${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB)`,
    );
  }
  invalidateServerDataCache(serverId);
  try {
    await assertDiskSpace(serverId, 0);
  } catch (err) {
    await fs.rm(dest.absolute, { force: true }).catch(() => undefined);
    invalidateServerDataCache(serverId);
    throw err;
  }
  await fixDataOwnership(serverDir(serverId));
  return { path: dest.relative, size: st.size };
}

const ARCHIVE_NAME_RE = /^[\w.\- ()[\]]+$/;
const MAX_COMPRESS_PATHS = 100;

function assertArchiveDestName(name: string): void {
  const base = path.basename(name);
  if (!base || base === "." || base === ".." || !ARCHIVE_NAME_RE.test(base)) {
    throw new Error("Invalid archive file name");
  }
  if (isSensitiveFileName(base)) {
    throw new Error("Cannot write over Guartrix control files");
  }
  const lower = base.toLowerCase();
  if (
    !lower.endsWith(".zip") &&
    !lower.endsWith(".tar.gz") &&
    !lower.endsWith(".tgz")
  ) {
    throw new Error("Archive must end with .zip, .tar.gz, or .tgz");
  }
}

function isArchivePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar")
  );
}

/** Resolve a file for streaming download (rejects dirs / sensitive / symlinks). */
export function resolveDownloadFile(
  serverId: string,
  relPath: string,
): { absolute: string; relative: string; size: number; fileName: string } {
  const { absolute, relative } = resolveSafePath(serverId, relPath);
  if (!relative) throw new Error("Select a file");
  assertNotSensitive(relative);
  const st = fsSync.lstatSync(absolute);
  if (st.isSymbolicLink()) {
    throw new Error("Symlinks are not allowed in server files");
  }
  if (!st.isFile()) throw new Error("Not a file");
  return {
    absolute,
    relative,
    size: st.size,
    fileName: path.basename(relative),
  };
}

/**
 * Compress one or more paths (files/dirs) into a zip or tar.gz under the server jail.
 * `destination` is relative to the server root (e.g. `world-backup.zip`).
 */
export async function compressPaths(
  serverId: string,
  paths: string[],
  destination: string,
): Promise<{ path: string; size: number }> {
  await fixDataOwnership(serverDir(serverId));
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("Select at least one file or folder");
  }
  if (paths.length > MAX_COMPRESS_PATHS) {
    throw new Error(`Too many paths (max ${MAX_COMPRESS_PATHS})`);
  }

  const destResolved = resolveSafePath(serverId, destination);
  if (!destResolved.relative) throw new Error("Invalid destination");
  assertArchiveDestName(destResolved.relative);
  if (fsSync.existsSync(destResolved.absolute)) {
    throw new Error("Destination already exists");
  }

  const root = destResolved.root;
  const members: string[] = [];
  for (const p of paths) {
    const resolved = resolveSafePath(serverId, p);
    if (!resolved.relative) throw new Error("Cannot archive the server root");
    assertNotSensitive(resolved.relative);
    if (!fsSync.existsSync(resolved.absolute)) {
      throw new Error(`Path not found: ${resolved.relative}`);
    }
    const st = fsSync.lstatSync(resolved.absolute);
    if (st.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed: ${resolved.relative}`);
    }
    members.push(resolved.relative);
  }

  await assertDiskSpace(serverId, 1024 * 1024);
  await fs.mkdir(path.dirname(destResolved.absolute), { recursive: true });

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const lower = destResolved.relative.toLowerCase();

  try {
    if (lower.endsWith(".zip")) {
      await execFileAsync("zip", ["-r", "-q", destResolved.absolute, ...members], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
      });
    } else {
      await execFileAsync(
        "tar",
        ["-czf", destResolved.absolute, "-C", root, ...members],
        { maxBuffer: 32 * 1024 * 1024 },
      );
    }
  } catch (err) {
    await fs.rm(destResolved.absolute, { force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Compress failed: ${message}`);
  }

  const st = await fs.stat(destResolved.absolute);
  invalidateServerDataCache(serverId);
  try {
    await assertDiskSpace(serverId, 0);
  } catch (err) {
    await fs.rm(destResolved.absolute, { force: true }).catch(() => undefined);
    invalidateServerDataCache(serverId);
    throw err;
  }
  await fixDataOwnership(serverDir(serverId));
  return { path: destResolved.relative, size: st.size };
}

/**
 * Stream a zip of selected paths to stdout (no archive written under the server jail).
 */
export async function streamZipPaths(
  serverId: string,
  paths: string[],
): Promise<{ stream: Readable; root: string; members: string[] }> {
  await fixDataOwnership(serverDir(serverId));
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("Select at least one file or folder");
  }
  if (paths.length > MAX_COMPRESS_PATHS) {
    throw new Error(`Too many paths (max ${MAX_COMPRESS_PATHS})`);
  }

  const root = serverDir(serverId);
  const members: string[] = [];
  for (const p of paths) {
    const resolved = resolveSafePath(serverId, p);
    if (!resolved.relative) throw new Error("Cannot archive the server root");
    assertNotSensitive(resolved.relative);
    if (!fsSync.existsSync(resolved.absolute)) {
      throw new Error(`Path not found: ${resolved.relative}`);
    }
    const st = fsSync.lstatSync(resolved.absolute);
    if (st.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed: ${resolved.relative}`);
    }
    members.push(resolved.relative);
  }

  const { spawn } = await import("node:child_process");
  const child = spawn("zip", ["-r", "-q", "-", ...members], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const errChunks: Buffer[] = [];
  child.stderr?.on("data", (c: Buffer) => errChunks.push(c));
  child.on("error", (err) => {
    child.stdout?.destroy(err);
  });
  child.on("close", (code) => {
    if (code !== 0 && child.stdout && !child.stdout.destroyed) {
      const detail = Buffer.concat(errChunks).toString("utf8").trim();
      child.stdout.destroy(
        new Error(
          detail
            ? `Zip failed: ${detail}`
            : `Zip failed with exit code ${code ?? "?"}`,
        ),
      );
    }
  });
  if (!child.stdout) throw new Error("Failed to start zip stream");
  return { stream: child.stdout, root, members };
}

/**
 * Extract a zip/tar archive into a directory under the server jail.
 * Default destination: folder named after the archive (without extension) beside it.
 */
export async function decompressArchive(
  serverId: string,
  archiveRel: string,
  destination?: string,
): Promise<{ path: string }> {
  await fixDataOwnership(serverDir(serverId));
  const archive = resolveSafePath(serverId, archiveRel);
  if (!archive.relative) throw new Error("Select an archive");
  assertNotSensitive(archive.relative);
  if (!isArchivePath(archive.relative)) {
    throw new Error("Supported archives: .zip, .tar, .tar.gz, .tgz");
  }
  const st = fsSync.lstatSync(archive.absolute);
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error("Not an archive file");
  }

  let destRel = (destination || "").trim();
  if (!destRel) {
    const base = path.basename(archive.relative);
    const withoutExt = base
      .replace(/\.tar\.gz$/i, "")
      .replace(/\.tgz$/i, "")
      .replace(/\.tar$/i, "")
      .replace(/\.zip$/i, "");
    const parent = path.posix.dirname(archive.relative);
    destRel =
      parent && parent !== "." ? `${parent}/${withoutExt || "extracted"}` : withoutExt || "extracted";
  }

  const dest = resolveSafePath(serverId, destRel);
  if (!dest.relative) throw new Error("Invalid destination");
  assertNotSensitive(dest.relative);

  await assertDiskSpace(serverId, Math.max(st.size, 1024 * 1024));
  await fs.mkdir(dest.absolute, { recursive: true });
  await safeExtractArchive(archive.absolute, dest.absolute);
  invalidateServerDataCache(serverId);
  try {
    await assertDiskSpace(serverId, 0);
  } catch (err) {
    // Leave extracted files; operator can delete. Surface quota error.
    throw err;
  }
  await fixDataOwnership(serverDir(serverId));
  return { path: dest.relative };
}

/** Extract a .tar.gz into the server data directory (multi-node deploy from panel). */
export async function deployServerArchive(
  serverId: string,
  archivePath: string,
): Promise<void> {
  const dir = serverDir(serverId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await safeExtractArchive(archivePath, dir);
  await fixDataOwnership(dir);
}

/** Pack the server data directory into a .tar.gz (for panel pull / cross-node clone). */
export async function exportServerArchive(
  serverId: string,
  archivePath: string,
): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const dir = serverDir(serverId);
  try {
    await fs.access(dir);
  } catch {
    throw new Error("Server data directory not found");
  }
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await execFileAsync(
    "tar",
    ["-czf", archivePath, "-C", dir, "."],
    { maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Remove all server files on this node (container stop is separate). */
export async function wipeServerData(serverId: string): Promise<void> {
  const dir = serverDir(serverId);
  await fs.rm(dir, { recursive: true, force: true });
}

export { TEXT_MAX_BYTES, UPLOAD_MAX_BYTES };
