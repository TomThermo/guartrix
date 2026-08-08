import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { finished } from "node:stream/promises";

const execFileAsync = promisify(execFile);

/** Max uncompressed bytes we will extract (zip bombs / huge backups). */
export const SAFE_EXTRACT_MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GiB
/** Max number of archive members. */
export const SAFE_EXTRACT_MAX_FILES = 100_000;

/** Cached: does `tar` accept GNU long options used for safer extract? */
let gnuTarLongOpts: boolean | undefined;

async function tarSupportsGnuLongOpts(): Promise<boolean> {
  if (gnuTarLongOpts !== undefined) return gnuTarLongOpts;
  try {
    const { stdout, stderr } = await execFileAsync("tar", ["--version"], {
      maxBuffer: 1024 * 1024,
    });
    gnuTarLongOpts = /GNU\s+tar/i.test(`${stdout}\n${stderr}`);
  } catch {
    // BusyBox / other: no GNU long options.
    gnuTarLongOpts = false;
  }
  return gnuTarLongOpts;
}

/** Build portable `tar -x` argv; skip GNU-only flags on BusyBox/etc. */
export async function tarExtractArgs(archivePath: string, destDir: string): Promise<string[]> {
  const lower = archivePath.toLowerCase();
  const args: string[] = [];
  if (await tarSupportsGnuLongOpts()) {
    args.push("--no-absolute-filenames", "--no-same-owner", "--no-same-permissions");
  }
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    args.push("-z");
  } else if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2")) {
    args.push("-j");
  } else if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) {
    args.push("-J");
  }
  args.push("-x", "-f", archivePath, "-C", destDir);
  return args;
}

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

/** Reject archives that declare symlink / hardlink members up front. */
async function assertNoLinkMembers(archivePath: string, isZip: boolean): Promise<void> {
  if (isZip) {
    let stdout = "";
    try {
      ({ stdout } = await execFileAsync("unzip", ["-Z", "-v", archivePath], {
        maxBuffer: 64 * 1024 * 1024,
      }));
    } catch {
      ({ stdout } = await execFileAsync("unzip", ["-Z", "-l", archivePath], {
        maxBuffer: 64 * 1024 * 1024,
      }));
    }
    if (/\bsymlink\b/i.test(stdout) || /\bl\s+[\d]/m.test(stdout)) {
      throw new Error("Archives must not contain symbolic links");
    }
    return;
  }

  const { stdout } = await execFileAsync("tar", ["-tvf", archivePath], {
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const mode = line[0];
    if (mode === "l" || mode === "L" || mode === "h" || mode === "1") {
      throw new Error("Archives must not contain symbolic or hard links");
    }
  }
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
      else if (e.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed in archives: ${e.name}`);
      } else if (e.isFile()) {
        const st = await fs.lstat(p);
        total += st.size;
        if (total > SAFE_EXTRACT_MAX_BYTES) {
          throw new Error(`Extracted archive exceeds size limit (${SAFE_EXTRACT_MAX_BYTES} bytes)`);
        }
      }
    }
  }
  await walk(root);
  return total;
}

async function extractZipMemberToFile(
  archivePath: string,
  member: string,
  destFile: string,
): Promise<number> {
  await fs.mkdir(path.dirname(destFile), { recursive: true, mode: 0o700 });
  const flags =
    fsSync.constants.O_WRONLY |
    fsSync.constants.O_CREAT |
    fsSync.constants.O_EXCL |
    (fsSync.constants.O_NOFOLLOW ?? 0);
  const fd = fsSync.openSync(destFile, flags, 0o644);
  const out = fsSync.createWriteStream("", { fd, autoClose: true });
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-p", archivePath, member], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > SAFE_EXTRACT_MAX_BYTES) {
        child.kill("SIGKILL");
        reject(new Error(`Extracted archive exceeds size limit (${SAFE_EXTRACT_MAX_BYTES} bytes)`));
      }
    });
    child.stdout.pipe(out);
    child.on("error", reject);
    child.stderr.on("data", () => undefined);
    void finished(out).then(resolve).catch(reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to extract ${member} from zip`));
      }
    });
  });
  return bytes;
}

/**
 * Safely extract zip/tar/tar.gz into destDir.
 * Rejects path traversal, symlinks/hardlinks, and caps member count / size.
 * Zip is extracted member-by-member so a symlink entry cannot redirect later writes.
 */
export async function safeExtractArchive(archivePath: string, destDir: string): Promise<void> {
  const lower = archivePath.toLowerCase();
  const isZip = lower.endsWith(".zip") || lower.endsWith(".mrpack") || lower.endsWith(".jar");
  const members = isZip ? await listZipMembers(archivePath) : await listTarMembers(archivePath);
  assertMembersSafe(members);
  await assertNoLinkMembers(archivePath, isZip);

  await fs.mkdir(destDir, { recursive: true, mode: 0o700 });

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "guartrix-extract-"));
  try {
    if (isZip) {
      let total = 0;
      for (const member of members) {
        const norm = member.replace(/\\/g, "/").replace(/\/+$/, "");
        if (!norm || member.replace(/\\/g, "/").endsWith("/")) {
          const dirPath = path.join(tmp, norm || member.replace(/\\/g, "/"));
          const resolvedDir = path.resolve(dirPath);
          if (
            !resolvedDir.startsWith(path.resolve(tmp) + path.sep) &&
            resolvedDir !== path.resolve(tmp)
          ) {
            throw new Error(`Unsafe extracted path: ${member}`);
          }
          await fs.mkdir(resolvedDir, { recursive: true, mode: 0o700 });
          continue;
        }
        const destFile = path.join(tmp, norm);
        const resolved = path.resolve(destFile);
        if (!resolved.startsWith(path.resolve(tmp) + path.sep)) {
          throw new Error(`Unsafe extracted path: ${member}`);
        }
        const nbytes = await extractZipMemberToFile(archivePath, member, resolved);
        total += nbytes;
        if (total > SAFE_EXTRACT_MAX_BYTES) {
          throw new Error(`Extracted archive exceeds size limit (${SAFE_EXTRACT_MAX_BYTES} bytes)`);
        }
      }
    } else {
      // Member paths already validated; GNU long-opts when available (BusyBox lacks them).
      const args = await tarExtractArgs(archivePath, tmp);
      await execFileAsync("tar", args, { maxBuffer: 32 * 1024 * 1024 });
    }

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
        const st = await fs.lstat(abs);
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

    const extracted = await fs.readdir(tmp, { withFileTypes: true });
    for (const e of extracted) {
      const from = path.join(tmp, e.name);
      const to = path.join(destDir, e.name);
      await fs.rename(from, to).catch(async () => {
        await fs.cp(from, to, { recursive: true, force: true });
        await fs.rm(from, { recursive: true, force: true });
      });
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
