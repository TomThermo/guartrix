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
const re = /fa-solid\s+fa-([a-z0-9-]+)/g;
const re2 = /["']fa-([a-z0-9-]+)["']/g;
const re3 = /icon:\s*["']fa-([a-z0-9-]+)["']/g;

for (const f of walk(webSrc)) {
  const src = fs.readFileSync(f, "utf8");
  for (const reUse of [re, re2, re3]) {
    reUse.lastIndex = 0;
    let m;
    while ((m = reUse.exec(src))) {
      icons.add(`fa-${m[1]}`);
    }
  }
}

const sorted = [...icons].sort();
const outPath = path.join(root, "apps/web/fa-safelist.json");
fs.writeFileSync(outPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${sorted.length} icon safelist entries → ${outPath}`);
