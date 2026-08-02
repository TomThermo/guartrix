import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

/** Max uncompressed bytes we will extract (zip bombs / huge backups). */
export const SAFE_EXTRACT_MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB
/** Max number of archive members. */
export const SAFE_EXTRACT_MAX_FILES = 100_000;

function isUnsafeMemberPath(entry: string): boolean {
  const n = entry.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!n || n === ".") return false;
  if (n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return true;
  if (n.split("/").some((p) => p === ".." || p === "")) return true;
  if (n.includes("\0")) return true;
  return false;
}

async function listZipMembers(archivePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("unzip", ["-Z1", archivePath], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function listTarMembers(archivePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("tar", ["-tf", archivePath], {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function assertMembersSafe(members: string[]): void {
  if (members.length > SAFE_EXTRACT_MAX_FILES) {
    throw new Error(
      `Archive has too many files (${members.length}; max ${SAFE_EXTRACT_MAX_FILES})`,
    );
  }
  for (const m of members) {
    if (isUnsafeMemberPath(m)) {
      throw new Error(`Archive contains unsafe path: ${m}`);
    }
  }
}

async function dirTotalBytes(root: string): Promise<number> {
  let total = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        const st = await fs.stat(p);
        total += st.size;
        if (total > SAFE_EXTRACT_MAX_BYTES) {
          throw new Error(
            `Extracted archive exceeds size limit (${SAFE_EXTRACT_MAX_BYTES} bytes)`,
          );
        }
      }
    }
  }
  await walk(root);
  return total;
}

/**
 * Safely extract zip/tar/tar.gz into destDir.
 * Rejects path traversal / absolute paths; caps member count and extracted size.
 */
export async function safeExtractArchive(
  archivePath: string,
  destDir: string,
): Promise<void> {
  const lower = archivePath.toLowerCase();
  const isZip = lower.endsWith(".zip");
  const members = isZip
    ? await listZipMembers(archivePath)
    : await listTarMembers(archivePath);
  assertMembersSafe(members);

  await fs.mkdir(destDir, { recursive: true, mode: 0o700 });

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "guartrix-extract-"));
  try {
    if (isZip) {
      await execFileAsync("unzip", ["-q", "-o", archivePath, "-d", tmp], {
        maxBuffer: 32 * 1024 * 1024,
      });
    } else if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
      await execFileAsync(
        "tar",
        ["--no-absolute-filenames", "-xzf", archivePath, "-C", tmp],
        { maxBuffer: 32 * 1024 * 1024 },
      );
    } else {
      await execFileAsync(
        "tar",
        ["--no-absolute-filenames", "-xf", archivePath, "-C", tmp],
        { maxBuffer: 32 * 1024 * 1024 },
      );
    }

    // Re-validate extracted tree (zip can still write odd names)
    async function validateTree(dir: string, relBase = ""): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === ".." || e.name.includes("\0")) {
          throw new Error(`Unsafe extracted name: ${e.name}`);
        }
        const rel = relBase ? `${relBase}/${e.name}` : e.name;
        if (isUnsafeMemberPath(rel)) {
          throw new Error(`Unsafe extracted path: ${rel}`);
        }
        const abs = path.join(dir, e.name);
        let st;
        try {
          st = await fs.lstat(abs);
        } catch {
          throw new Error(`Cannot stat extracted path: ${rel}`);
        }
        if (st.isSymbolicLink()) {
          throw new Error(`Symlinks are not allowed in archives: ${rel}`);
        }
        const real = await fs.realpath(abs);
        const tmpReal = await fs.realpath(tmp);
        if (!real.startsWith(tmpReal + path.sep) && real !== tmpReal) {
          throw new Error(`Extracted path escaped temp dir: ${rel}`);
        }
        if (e.isDirectory()) await validateTree(abs, rel);
      }
    }
    await validateTree(tmp);
    await dirTotalBytes(tmp);

    // Move into destination
    const extracted = await fs.readdir(tmp, { withFileTypes: true });
    for (const e of extracted) {
      const from = path.join(tmp, e.name);
      const to = path.join(destDir, e.name);
      await fs.rename(from, to).catch(async () => {
        // cross-device: copy
        await fs.cp(from, to, { recursive: true, force: true });
        await fs.rm(from, { recursive: true, force: true });
      });
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
