import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** Strip workspace packages; keep runtime deps needed by the release daemon bundle. */
export function standaloneDaemonPackageJson(version = "0.0.0") {
  return {
    name: "@msm/daemon",
    version,
    private: true,
    type: "module",
    scripts: { start: "node dist/index.js" },
    dependencies: {
      "@fastify/multipart": "^10.1.0",
      "@fastify/websocket": "^11.0.2",
      "@sentry/node": "^10.69.0",
      dotenv: "^16.4.7",
      fastify: "^5.2.1",
      nanoid: "^5.1.5",
      "prom-client": "^15.1.3",
      ssh2: "^1.16.0",
      zod: "^3.24.2",
    },
  };
}

/** Newest `guartrix-daemon-*.zip` under data/downloads, if any. */
export function findPublishedDaemonZip(rootDir) {
  const dir = path.join(rootDir, "data", "downloads");
  if (!fs.existsSync(dir)) return null;
  const names = fs
    .readdirSync(dir)
    .filter((n) => /^guartrix-daemon-.*\.zip$/i.test(n))
    .sort();
  if (names.length === 0) return null;
  return path.join(dir, names[names.length - 1]);
}

function readProductVersion(rootDir) {
  try {
    const v = fs.readFileSync(path.join(rootDir, "VERSION"), "utf8").trim().split(/\s/)[0];
    if (v) return v;
  } catch {
    /* fall through */
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "apps/daemon/package.json"), "utf8"));
    if (pkg.version) return String(pkg.version);
  } catch {
    /* fall through */
  }
  return "0.0.0";
}

/**
 * Build a temporary standalone daemon zip from live `apps/daemon/dist`
 * (used when no published download zip exists yet).
 */
export function buildEphemeralDaemonZip(rootDir) {
  const distJs = path.join(rootDir, "apps/daemon/dist/index.js");
  if (!fs.existsSync(distJs)) return null;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guartrix-daemon-bundle-"));
  const stage = path.join(tmp, "stage");
  fs.mkdirSync(path.join(stage, "apps/daemon/dist"), { recursive: true });
  fs.mkdirSync(path.join(stage, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(stage, "data/licenses"), { recursive: true });

  fs.copyFileSync(distJs, path.join(stage, "apps/daemon/dist/index.js"));
  fs.writeFileSync(
    path.join(stage, "apps/daemon/package.json"),
    JSON.stringify(standaloneDaemonPackageJson(readProductVersion(rootDir)), null, 2) + "\n",
  );

  const installSh = path.join(rootDir, "scripts/install-daemon.sh");
  if (fs.existsSync(installSh)) {
    fs.copyFileSync(installSh, path.join(stage, "scripts/install-daemon.sh"));
  }
  const licenseHelper = path.join(rootDir, "scripts/lib-license-public-key.sh");
  if (fs.existsSync(licenseHelper)) {
    fs.copyFileSync(licenseHelper, path.join(stage, "scripts/lib-license-public-key.sh"));
  }
  const pemSrc = fs.existsSync(path.join(rootDir, "packages/shared/license-signing-public.pem"))
    ? path.join(rootDir, "packages/shared/license-signing-public.pem")
    : path.join(rootDir, "data/licenses/signing-public.pem");
  if (fs.existsSync(pemSrc)) {
    fs.copyFileSync(pemSrc, path.join(stage, "data/licenses/signing-public.pem"));
    fs.mkdirSync(path.join(stage, "packages/shared"), { recursive: true });
    fs.copyFileSync(pemSrc, path.join(stage, "packages/shared/license-signing-public.pem"));
  }

  const outZip = path.join(tmp, "guartrix-daemon-bundle.zip");
  const z = spawnSync("zip", ["-qr", outZip, "."], { cwd: stage, encoding: "utf8" });
  if (z.status !== 0 || !fs.existsSync(outZip)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return null;
  }
  return { zipPath: outZip, cleanupDir: tmp };
}

/** Resolve a file path to stream for `/install-daemon-bundle.zip`. */
export function resolveDaemonBundle(rootDir) {
  const published = findPublishedDaemonZip(rootDir);
  if (published) {
    return { zipPath: published, cleanupDir: null };
  }
  return buildEphemeralDaemonZip(rootDir);
}
