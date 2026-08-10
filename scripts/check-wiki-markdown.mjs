#!/usr/bin/env node
/**
 * Ensure every wiki article with sourcePath has an embedded markdown body.
 * Usage: node scripts/check-wiki-markdown.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const articleDir = path.join(root, "apps/web/src/wiki/articles");

const sourceRe = /sourcePath:\s*"([^"]+)"/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const missing = [];
for (const file of walk(articleDir)) {
  const src = fs.readFileSync(file, "utf8");
  let m;
  while ((m = sourceRe.exec(src))) {
    const sourcePath = m[1];
    const disk =
      sourcePath === "README.md"
        ? path.join(root, "README.md")
        : path.join(root, sourcePath);
    if (!fs.existsSync(disk)) {
      missing.push({ file: path.relative(root, file), sourcePath });
    }
  }
}

if (missing.length) {
  console.error("Wiki markdown source files missing:\n");
  for (const item of missing) {
    console.error(`  ${item.sourcePath} (from ${item.file})`);
  }
  process.exit(1);
}

console.log("check-wiki-markdown: ok");
