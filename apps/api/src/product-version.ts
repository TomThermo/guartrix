/**
 * Panel / product version helpers (semver-ish: major.minor.patch).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRootDir(): string {
  // apps/api/dist → ../../../ ; apps/daemon/dist → ../../../ ; etc.
  const here = path.dirname(fileURLToPath(import.meta.url));
  // This file lives in apps/api/src or is bundled into apps/*/dist
  const candidates = [
    path.resolve(here, "../../../"), // dist or src under apps/api
    path.resolve(here, "../../"), // if somehow at apps/
    process.cwd(),
  ];
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, "VERSION"))) return root;
    if (fs.existsSync(path.join(root, "package.json"))) return root;
  }
  return process.cwd();
}

let cached: string | null = null;

/** Current Guartrix product version from VERSION file (fallback package.json / 0.0.0). */
export function getProductVersion(): string {
  if (cached) return cached;
  const root = findRootDir();
  try {
    const raw = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
    if (raw) {
      cached = raw.split(/\s/)[0]!;
      return cached;
    }
  } catch {
    /* fall through */
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
      version?: string;
    };
    if (pkg.version) {
      cached = pkg.version;
      return cached;
    }
  } catch {
    /* fall through */
  }
  cached = "0.0.0";
  return cached;
}

/** Parse "1.2.3" / "1.2.3-beta" → [1,2,3] (pre-release suffix ignored for compare). */
export function parseSemver(v: string): [number, number, number] | null {
  const m = String(v)
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** -1 if a<b, 0 if equal, 1 if a>b. Invalid versions sort as older. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i]! < pb[i]!) return -1;
    if (pa[i]! > pb[i]!) return 1;
  }
  return 0;
}

export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareSemver(current, latest) < 0;
}

export function meetsMinVersion(current: string, minVersion: string): boolean {
  if (!minVersion.trim()) return true;
  return compareSemver(current, minVersion) >= 0;
}
