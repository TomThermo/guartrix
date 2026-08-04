#!/usr/bin/env node
/**
 * Append minimal OpenAPI path stubs for API routes missing from docs/openapi.yaml.
 * Usage: node scripts/generate-openapi-stubs.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

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

function normalizeRoute(route) {
  return route.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}

function canon(p) {
  return p.replace(/\{[^}]+\}/g, "{param}").replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "{param}");
}

function tagFor(route) {
  if (route.startsWith("/api/admin/")) return "Admin";
  if (route.startsWith("/api/billing") || route.includes("/billing")) return "Billing";
  if (route.startsWith("/api/auth") || route.startsWith("/api/account") || route.startsWith("/api/invites")) return "Account";
  if (route.startsWith("/api/internal")) return "Admin";
  if (route.startsWith("/api/public")) return "Client";
  if (route.startsWith("/api/users") || route === "/api/system") return "Admin";
  return "Client";
}

function securityFor(route, tag) {
  if (route.startsWith("/api/auth/register") || route.startsWith("/api/auth/forgot-password") || route.startsWith("/api/auth/reset-password") || route.startsWith("/api/auth/verify-email")) {
    return null;
  }
  if (route.startsWith("/api/invites/") || route.startsWith("/api/public/")) return null;
  if (route.startsWith("/api/internal/")) return null;
  if (tag === "Admin") return [{ SessionCookie: [] }];
  if (tag === "Account") return [{ SessionCookie: [] }];
  return [{ ClientApiKey: [] }, { SessionCookie: [] }];
}

function pathParams(route) {
  const params = [];
  for (const m of route.matchAll(/\{([^}]+)\}/g)) {
    params.push({ name: m[1], in: "path", required: true, schema: { type: "string" } });
  }
  return params;
}

const pathMethods = new Map();
const routeRe =
  /\bapp\.(get|post|put|patch|delete|head|options)\s*(?:<[^>]*>)?\s*\(\s*(?:\{[^}]*\}\s*,\s*)?["'`](\/[^"'`]+)["'`]/g;
const routeRe2 =
  /\bapp\.(get|post|put|patch|delete)\s*<[\s\S]*?>\s*\(\s*["'`](\/[^"'`]+)["'`]/g;

for (const f of walk(path.join(root, "apps/api/src"))) {
  const src = fs.readFileSync(f, "utf8");
  for (const re of [routeRe, routeRe2]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const method = m[1].toLowerCase();
      const r = normalizeRoute(m[2].split("?")[0]);
      if (!r.startsWith("/api/") && r !== "/metrics" && r !== "/health") continue;
      if (!pathMethods.has(r)) pathMethods.set(r, new Set());
      pathMethods.get(r).add(method);
    }
  }
}

const oaPath = path.join(root, "docs/openapi.yaml");
const yaml = fs.readFileSync(oaPath, "utf8");
const oaRoutes = new Set();
for (const line of yaml.split("\n")) {
  const m = line.match(/^  (\/(?:api\/)?[^\s:]+):\s*$/);
  if (m) oaRoutes.add(m[1]);
}
const oaCanon = new Map([...oaRoutes].map((p) => [canon(p), p]));

const missing = [...pathMethods.keys()]
  .filter((r) => !oaRoutes.has(r) && !oaCanon.has(canon(r)))
  .sort();

function stubPath(route) {
  const methods = [...pathMethods.get(route)].filter((m) => m !== "head" && m !== "options").sort();
  const tag = tagFor(route);
  const sec = securityFor(route, tag);
  const params = pathParams(route);
  const hasServerId = route.includes("{id}") && route.startsWith("/api/servers/");
  const lines = [`  ${route}:`];
  for (const method of methods) {
    const summary = `${method.toUpperCase()} ${route}`;
    lines.push(`    ${method}:`);
    lines.push(`      tags: [${tag}]`);
    lines.push(`      summary: ${JSON.stringify(summary)}`);
    if (sec) lines.push(`      security: ${JSON.stringify(sec).replace(/"/g, "")}`.replace(/(\w+):/g, "$1:"));
    // fix security yaml manually below
    if (sec) {
      lines.pop();
      lines.push(`      security:`);
      for (const s of sec) {
        const key = Object.keys(s)[0];
        lines.push(`        - ${key}: []`);
      }
    }
    if (params.length) {
      lines.push(`      parameters:`);
      for (const p of params) {
        if (p.name === "id" && hasServerId) {
          lines.push(`        - $ref: "#/components/parameters/ServerId"`);
        } else {
          lines.push(`        - name: ${p.name}`);
          lines.push(`          in: path`);
          lines.push(`          required: true`);
          lines.push(`          schema: { type: string }`);
        }
      }
    }
    lines.push(`      responses:`);
    lines.push(`        "200":`);
    lines.push(`          description: OK`);
  }
  return lines.join("\n");
}

const stubs = missing.map(stubPath).join("\n");
if (dryRun) {
  console.log(stubs);
  console.error(`\nWould add ${missing.length} paths`);
  process.exit(0);
}

const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
let out = yaml.replace(/version: "[^"]+"/, `version: "${version}"`);
if (!out.endsWith("\n")) out += "\n";
out += stubs + "\n";
fs.writeFileSync(oaPath, out);
console.log(`Added ${missing.length} path stubs to docs/openapi.yaml (version ${version})`);
