/**
 * Path containment helpers for the embedded SFTP server: every incoming
 * client path is resolved against a per-server "jail" root and rejected if it
 * would escape that root (via `..`, absolute symlinks, etc).
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Resolves a client-supplied SFTP path against `root`, refusing to leave the
 * jail (via `..` segments or symlinks). Returns `null` if the path is unsafe.
 */
export function resolveJailPath(root: string, requestPath: string): string | null {
  const cleaned = requestPath.replace(/\\/g, "/");
  const relative = cleaned.replace(/^\/+/, "");
  const rootResolved = path.resolve(root);
  let rootReal = rootResolved;
  try {
    rootReal = fs.realpathSync(rootResolved);
  } catch {
    // root may not exist yet
  }

  const parts = relative ? relative.split("/").filter((p) => p && p !== ".") : [];
  if (parts.some((p) => p === "..")) return null;

  let cursor = rootReal;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const st = fs.lstatSync(cursor);
      if (st.isSymbolicLink()) return null;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") break;
      return null;
    }
  }

  const resolved = parts.length ? path.resolve(rootReal, parts.join("/")) : rootReal;
  if (resolved !== rootReal && !resolved.startsWith(rootReal + path.sep)) {
    return null;
  }
  if (fs.existsSync(resolved)) {
    try {
      const real = fs.realpathSync(resolved);
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return resolved;
}

/** Converts an absolute on-disk path back to the SFTP-visible path under `root`. */
export function toSftpPath(root: string, absolute: string): string {
  const rel = path.relative(root, absolute).split(path.sep).join("/");
  return rel ? `/${rel}` : "/";
}
