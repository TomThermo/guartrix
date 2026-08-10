#!/usr/bin/env node
/**
 * Fail if account crypto modules are imported outside the auth boundary.
 *
 * Allowed:
 *   - apps/api/src/auth/**
 *   - apps/api/src/services/account-profile.ts
 *   - apps/api/src/routes/auth/**
 *
 * Modules gated: password-hash, totp, password-policy, password-verify
 * (db-password.ts is MySQL secrets — not gated.)
 *
 * Usage: node scripts/check-auth-crypto-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiSrc = path.join(root, "apps/api/src");

const CRYPTO_RE =
  /from\s+["'][^"']*\/(password-hash|totp|password-policy|password-verify)(?:\.js)?["']|from\s+["']\.\/(password-hash|totp|password-policy|password-verify)(?:\.js)?["']|require\(\s*["'][^"']*\/(password-hash|totp|password-policy|password-verify)/g;

function isAllowed(relPosix) {
  if (relPosix.startsWith("auth/")) return true;
  if (relPosix.startsWith("routes/auth/")) return true;
  if (relPosix === "services/account-profile.ts") return true;
  return false;
}

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

const violations = [];
for (const file of walk(apiSrc)) {
  const rel = path.relative(apiSrc, file).split(path.sep).join("/");
  if (isAllowed(rel)) continue;
  const src = fs.readFileSync(file, "utf8");
  CRYPTO_RE.lastIndex = 0;
  let m;
  while ((m = CRYPTO_RE.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    violations.push(`${rel}:${line}: ${m[0]}`);
  }
}

if (violations.length) {
  console.error("Auth crypto import gate failed:\n");
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    "\nOnly apps/api/src/auth/**, routes/auth/**, and services/account-profile.ts may import password-hash|totp|password-policy|password-verify.",
  );
  process.exit(1);
}

console.log("check-auth-crypto-imports: ok");
