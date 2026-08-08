#!/usr/bin/env node
/**
 * Bundle the panel daemon into a single apps/daemon/dist/index.js and publish
 * data/downloads/guartrix-daemon-<version>.zip for /install-daemon-bundle.zip
 * (remote Add-node installs). Safe to run after `npm run build` on any panel host.
 *
 *   node scripts/bundle-daemon-for-nodes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WORKSPACE_ALIASES = {
  "@msm/shared/daemon-jwt": path.join(rootDir, "packages/shared/src/daemon-jwt.ts"),
  "@msm/shared/license-signing": path.join(rootDir, "packages/shared/src/license-signing.ts"),
  "@msm/shared/license-ticket": path.join(rootDir, "packages/shared/src/license-ticket.ts"),
  "@msm/shared": path.join(rootDir, "packages/shared/src/index.ts"),
  "@msm/node-agent": path.join(rootDir, "packages/node-agent/src/index.ts"),
};

function readVersion() {
  try {
    const v = fs.readFileSync(path.join(rootDir, "VERSION"), "utf8").trim().split(/\s/)[0];
    if (v) return v;
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, "apps/daemon/package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

function workspaceBundlePlugin() {
  return {
    name: "guartrix-workspace-bundle",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (
          args.path.startsWith("./") ||
          args.path.startsWith("../") ||
          path.isAbsolute(args.path)
        ) {
          return undefined;
        }
        const aliasKey = Object.keys(WORKSPACE_ALIASES)
          .sort((a, b) => b.length - a.length)
          .find((key) => args.path === key || args.path.startsWith(`${key}/`));
        if (aliasKey) {
          return { path: WORKSPACE_ALIASES[aliasKey] };
        }
        return { path: args.path, external: true };
      });
    },
  };
}

async function bundleDaemon() {
  const entry = path.join(rootDir, "apps/daemon/src/index.ts");
  const outfile = path.join(rootDir, "apps/daemon/dist/index.js");
  if (!fs.existsSync(entry)) {
    if (fs.existsSync(outfile)) {
      console.log("[guartrix] No daemon sources — keeping existing apps/daemon/dist/index.js");
      return outfile;
    }
    throw new Error("apps/daemon/src/index.ts missing and no prebuilt dist");
  }

  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  // Drop stale tsc multi-file output so only the single bundle remains.
  for (const name of fs.readdirSync(path.dirname(outfile))) {
    if (name === "index.js") continue;
    fs.rmSync(path.join(path.dirname(outfile), name), { recursive: true, force: true });
  }

  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: true,
    legalComments: "none",
    banner: {
      js: "// Guartrix daemon — single-file bundle for panel + remote nodes\n",
    },
    plugins: [workspaceBundlePlugin()],
  });
  console.log(`[guartrix] Bundled daemon → ${outfile}`);
  return outfile;
}

async function main() {
  await bundleDaemon();
  const { ensurePublishedDaemonZip } = await import(
    pathToFileURL(path.join(rootDir, "scripts/prod-web/daemon-bundle.mjs")).href
  );
  const zipPath = ensurePublishedDaemonZip(rootDir, { force: true });
  if (!zipPath) {
    throw new Error("Failed to write data/downloads/guartrix-daemon-*.zip (is zip/python3 available?)");
  }
  console.log(`[guartrix] Daemon install bundle ready → ${zipPath}`);
  console.log(`[guartrix] Served as ${process.env.PUBLIC_BASE_URL || "http://PANEL"}/install-daemon-bundle.zip`);
}

main().catch((err) => {
  console.error("[guartrix]", err instanceof Error ? err.message : err);
  process.exit(1);
});
