#!/usr/bin/env node
/**
 * Scan apps/web for Font Awesome solid icon class names.
 * Output safelist for PurgeCSS (vite production build).
 *
 * Usage: node scripts/fa-subset-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webSrc = path.join(root, "apps/web/src");

/** Known dynamic icon maps in source (not visible to static regex). */
const EXTRA = [
  "fa-cube",
  "fa-server",
  "fa-leaf",
  "fa-gears",
  "fa-puzzle-piece",
  "fa-microchip",
  "fa-globe",
  "fa-heart-pulse",
  "fa-database",
  // file-manager: `"fa-folder text-warning"` (space-separated class strings)
  "fa-folder",
  // PocketMine type icon — brands-only in FA free; use solid stand-in in utils
  "fa-code",
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const icons = new Set(EXTRA);
/** Skip utility/size classes — not glyph `--fa` rules. */
const SKIP = new Set([
  "fa-solid",
  "fa-regular",
  "fa-brands",
  "fa-classic",
  "fa-fw",
  "fa-spin",
  "fa-pulse",
  "fa-beat",
  "fa-fade",
  "fa-bounce",
  "fa-shake",
  "fa-flip",
  "fa-2x",
  "fa-lg",
  "fa-sm",
  "fa-xl",
  "fa-xs",
  "fa-1x",
  "fa-10x",
]);
/** `fa-solid fa-foo`, `"fa-foo"`, `icon: "fa-foo"`, or `"fa-foo text-warning"`. */
const re = /(?:^|[^a-z0-9-])fa-([a-z0-9-]+)/g;

const scanRoots = [webSrc, path.join(root, "packages/shared/src")];
for (const scanRoot of scanRoots) {
  if (!fs.existsSync(scanRoot)) continue;
  for (const f of walk(scanRoot)) {
    const src = fs.readFileSync(f, "utf8");
    re.lastIndex = 0;
    let m = re.exec(src);
    while (m) {
      const name = `fa-${m[1]}`;
      if (!SKIP.has(name)) icons.add(name);
      m = re.exec(src);
    }
  }
}

const sorted = [...icons].sort();
const outPath = path.join(root, "apps/web/fa-safelist.json");
fs.writeFileSync(outPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${sorted.length} icon safelist entries → ${outPath}`);
