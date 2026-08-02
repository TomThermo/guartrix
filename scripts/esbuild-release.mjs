#!/usr/bin/env node
/**
 * Production release bundle for Node apps (api / daemon).
 *
 * - One minified ESM file per app (like Vite does for web)
 * - Inlines workspace packages (@msm/shared, @msm/node-agent) from TypeScript source
 * - Leaves npm deps external (Prisma, ssh2, Fastify, …)
 *
 * Usage:
 *   node scripts/esbuild-release.mjs api
 *   node scripts/esbuild-release.mjs daemon
 *   node scripts/esbuild-release.mjs all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WORKSPACE_ALIASES = {
  "@msm/shared/daemon-jwt": path.join(
    rootDir,
    "packages/shared/src/daemon-jwt.ts",
  ),
  "@msm/shared/license-signing": path.join(
    rootDir,
    "packages/shared/src/license-signing.ts",
  ),
  "@msm/shared": path.join(rootDir, "packages/shared/src/index.ts"),
  "@msm/node-agent": path.join(rootDir, "packages/node-agent/src/index.ts"),
};

const APPS = {
  api: {
    entry: "apps/api/src/index.ts",
    outfile: "apps/api/dist/index.js",
    cleanDir: "apps/api/dist",
  },
  daemon: {
    entry: "apps/daemon/src/index.ts",
    outfile: "apps/daemon/dist/index.js",
    cleanDir: "apps/daemon/dist",
  },
};

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

        // Longest alias wins (@msm/shared/daemon-jwt before @msm/shared)
        const aliasKey = Object.keys(WORKSPACE_ALIASES)
          .sort((a, b) => b.length - a.length)
          .find(
            (key) => args.path === key || args.path.startsWith(`${key}/`),
          );
        if (aliasKey) {
          return { path: WORKSPACE_ALIASES[aliasKey] };
        }

        return { path: args.path, external: true };
      });
    },
  };
}

async function buildApp(name) {
  const cfg = APPS[name];
  if (!cfg) throw new Error(`Unknown app: ${name}`);

  const entry = path.join(rootDir, cfg.entry);
  const outfile = path.join(rootDir, cfg.outfile);
  const cleanDir = path.join(rootDir, cfg.cleanDir);

  if (!fs.existsSync(entry)) {
    throw new Error(`Entry not found: ${entry}`);
  }

  fs.rmSync(cleanDir, { recursive: true, force: true });
  fs.mkdirSync(cleanDir, { recursive: true });

  const result = await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: true,
    legalComments: "none",
    sourcemap: false,
    banner: {
      js: "// Guartrix release build — bundled + minified\n",
    },
    plugins: [workspaceBundlePlugin()],
    logLevel: "info",
  });

  if (result.errors.length) {
    throw new Error(`esbuild failed for ${name}`);
  }

  const size = fs.statSync(outfile).size;
  console.log(
    `[release] ${name} → ${path.relative(rootDir, outfile)} (${(size / 1024).toFixed(1)} KiB)`,
  );
}

const arg = process.argv[2] ?? "all";
const names = arg === "all" ? Object.keys(APPS) : [arg];

for (const name of names) {
  await buildApp(name);
}
