import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** Resolve hoisted or local vite CLI, then build with a larger heap (Monaco). */
const require = createRequire(import.meta.url);
const vitePkgJson = require.resolve("vite/package.json");
const viteBin = path.join(path.dirname(vitePkgJson), "bin", "vite.js");
if (!fs.existsSync(viteBin)) {
  console.error(`[vite-build] vite CLI not found at ${viteBin}`);
  process.exit(1);
}
const result = spawnSync(process.execPath, ["--max-old-space-size=3072", viteBin, "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
