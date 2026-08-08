import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { safeExtractArchive } from "./safe-archive.js";
import { serverDir } from "./config.js";
import { fixDataOwnership } from "./process-manager.js";
import { assertDiskSpace, invalidateServerDataCache } from "./disk-quota.js";
import { assertNotSensitive, isSensitiveFileName, resolveSafePath } from "./files-crud.js";

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
  if (!lower.endsWith(".zip") && !lower.endsWith(".tar.gz") && !lower.endsWith(".tgz")) {
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
      await execFileAsync("tar", ["-czf", destResolved.absolute, "-C", root, ...members], {
        maxBuffer: 32 * 1024 * 1024,
      });
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
        new Error(detail ? `Zip failed: ${detail}` : `Zip failed with exit code ${code ?? "?"}`),
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
      parent && parent !== "."
        ? `${parent}/${withoutExt || "extracted"}`
        : withoutExt || "extracted";
  }

  const dest = resolveSafePath(serverId, destRel);
  if (!dest.relative) throw new Error("Invalid destination");
  assertNotSensitive(dest.relative);

  await assertDiskSpace(serverId, Math.max(st.size, 1024 * 1024));
  await fs.mkdir(dest.absolute, { recursive: true });
  await safeExtractArchive(archive.absolute, dest.absolute);
  invalidateServerDataCache(serverId);
  await assertDiskSpace(serverId, 0);
  await fixDataOwnership(serverDir(serverId));
  return { path: dest.relative };
}

/** Extract a .tar.gz into the server data directory (multi-node deploy from panel). */
export async function deployServerArchive(serverId: string, archivePath: string): Promise<void> {
  const dir = serverDir(serverId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await safeExtractArchive(archivePath, dir);
  await fixDataOwnership(dir);
}

/** Pack the server data directory into a .tar.gz (for panel pull / cross-node clone). */
export async function exportServerArchive(serverId: string, archivePath: string): Promise<void> {
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
  await execFileAsync("tar", ["-czf", archivePath, "-C", dir, "."], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Remove all server files on this node (container stop is separate). */
export async function wipeServerData(serverId: string): Promise<void> {
  const dir = serverDir(serverId);
  await fs.rm(dir, { recursive: true, force: true });
}
