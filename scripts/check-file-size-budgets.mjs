#!/usr/bin/env node
/**
 * Fail when route/page/component files exceed LOC budgets.
 * Opt out with a line containing `size-budget: ignore` (document why in the same comment).
 *
 * Usage: node scripts/check-file-size-budgets.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asJson = process.argv.includes("--json");

/** max physical lines (inclusive) per area */
const BUDGETS = [
  { name: "api-routes", dir: "apps/api/src/routes", max: 350, glob: /\.ts$/ },
  { name: "api-services", dir: "apps/api/src/services", max: 450, glob: /\.ts$/ },
  { name: "web-pages", dir: "apps/web/src/pages", max: 250, glob: /\.tsx$/ },
  { name: "web-components", dir: "apps/web/src/components", max: 450, glob: /\.tsx$/ },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function lineCount(file) {
  return fs.readFileSync(file, "utf8").split("\n").length;
}

function ignored(file) {
  const src = fs.readFileSync(file, "utf8");
  return /size-budget:\s*ignore/i.test(src);
}

const violations = [];

for (const rule of BUDGETS) {
  const base = path.join(root, rule.dir);
  for (const file of walk(base)) {
    if (!rule.glob.test(file)) continue;
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    if (ignored(file)) continue;
    const lines = lineCount(file);
    if (lines > rule.max) {
      violations.push({
        rule: rule.name,
        file: path.relative(root, file),
        lines,
        max: rule.max,
      });
    }
  }
}

if (violations.length) {
  if (asJson) {
    console.log(JSON.stringify({ ok: false, violations }, null, 2));
  } else {
    console.error("File size budget violations:\n");
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.lines} lines (max ${v.max} for ${v.rule})`);
    }
    console.error(
      "\nSplit the file or add `size-budget: ignore` with a short reason in a comment near the top.",
    );
  }
  process.exit(1);
}

if (asJson) {
  console.log(JSON.stringify({ ok: true, budgets: BUDGETS.map((b) => ({ name: b.name, max: b.max })) }));
} else {
  console.log("check-file-size-budgets: ok");
}
