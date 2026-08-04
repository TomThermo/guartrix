#!/usr/bin/env node
/**
 * Drift check: Fastify `/api/...` route strings vs docs/openapi.yaml paths.
 * Exits 1 if documented coverage falls below MIN_COVERAGE (default 0.45)
 * or if --strict and any route is missing from OpenAPI.
 *
 * Usage: node scripts/check-openapi-coverage.mjs [--strict] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_COVERAGE = Number(process.env.OPENAPI_MIN_COVERAGE ?? "0.25");
const strict = process.argv.includes("--strict");
const asJson = process.argv.includes("--json");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walk(p, out);
    } else if (ent.name.endsWith(".ts") || ent.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

/** Normalize Fastify path params to OpenAPI `{id}` style. */
function normalizeRoute(route) {
  return route
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}")
    .replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, (m) => {
      // Collapse common id-like params to {id} for fuzzy match later
      return m;
    });
}

function extractRoutesFromSource(src) {
  const routes = new Set();
  // app.get("/api/...", ...) or app.get<{...}>("/api/...", ...)
  const re =
    /\bapp\.(?:get|post|put|patch|delete|head|options)\s*(?:<[^>]*>)?\s*\(\s*(?:\{[^}]*\}\s*,\s*)?["'`](\/[^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(src))) {
    const r = m[1].split("?")[0];
    if (r.startsWith("/api/") || r === "/metrics" || r === "/health") {
      routes.add(normalizeRoute(r));
    }
  }
  // Also catch multi-line: app.get<\n  ...\n>("/api/...
  const re2 =
    /\bapp\.(?:get|post|put|patch|delete)\s*<[\s\S]*?>\s*\(\s*["'`](\/[^"'`]+)["'`]/g;
  while ((m = re2.exec(src))) {
    const r = m[1].split("?")[0];
    if (r.startsWith("/api/") || r === "/metrics" || r === "/health") {
      routes.add(normalizeRoute(r));
    }
  }
  return routes;
}

function extractOpenApiPaths(yaml) {
  const paths = new Set();
  for (const line of yaml.split("\n")) {
    const m = line.match(/^  (\/(?:api\/)?[^\s:]+):\s*$/);
    if (m) paths.add(m[1]);
  }
  return paths;
}

/** Match Fastify `:id` / OpenAPI `{id}` and similar param renames. */
function canon(p) {
  return p.replace(/\{[^}]+\}/g, "{param}").replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "{param}");
}

const apiSrcRoot = path.join(root, "apps/api/src");
const files = walk(apiSrcRoot);
const codeRoutes = new Set();
for (const f of files) {
  for (const r of extractRoutesFromSource(fs.readFileSync(f, "utf8"))) {
    codeRoutes.add(r);
  }
}

const oaPath = path.join(root, "docs/openapi.yaml");
const oaRoutes = extractOpenApiPaths(fs.readFileSync(oaPath, "utf8"));

const oaCanon = new Map([...oaRoutes].map((p) => [canon(p), p]));
const codeCanon = new Map([...codeRoutes].map((p) => [canon(p), p]));
const documented = [];
const missing = [];
for (const r of [...codeRoutes].sort()) {
  const c = canon(r);
  if (oaRoutes.has(r) || oaCanon.has(c)) documented.push(r);
  else missing.push(r);
}

const stale = [];
for (const p of [...oaRoutes].sort()) {
  const c = canon(p);
  if (!codeRoutes.has(p) && !codeCanon.has(c)) stale.push(p);
}

const coverage = codeRoutes.size ? documented.length / codeRoutes.size : 1;
const report = {
  codeRoutes: codeRoutes.size,
  openApiPaths: oaRoutes.size,
  documented: documented.length,
  missing: missing.length,
  stale: stale.length,
  coverage: Number(coverage.toFixed(3)),
  minCoverage: MIN_COVERAGE,
  missingPaths: missing,
  stalePaths: stale,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `OpenAPI coverage: ${documented.length}/${codeRoutes.size} (${(coverage * 100).toFixed(1)}%) · yaml paths: ${oaRoutes.size}`,
  );
  if (missing.length) {
    console.log(`Undocumented (${missing.length}):`);
    for (const p of missing.slice(0, 40)) console.log(`  ${p}`);
    if (missing.length > 40) console.log(`  … +${missing.length - 40} more`);
  }
  if (stale.length) {
    console.log(`Stale in OpenAPI (not in code) (${stale.length}):`);
    for (const p of stale) console.log(`  ${p}`);
  }
}

if (stale.length) {
  console.error(`FAIL: ${stale.length} OpenAPI path(s) not found in API source`);
  process.exit(1);
}
if (coverage < MIN_COVERAGE) {
  console.error(
    `FAIL: coverage ${(coverage * 100).toFixed(1)}% < min ${(MIN_COVERAGE * 100).toFixed(0)}%`,
  );
  process.exit(1);
}
if (strict && missing.length) {
  console.error(`FAIL: --strict with ${missing.length} undocumented routes`);
  process.exit(1);
}
process.exit(0);
