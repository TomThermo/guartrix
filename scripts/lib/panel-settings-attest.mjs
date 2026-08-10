#!/usr/bin/env node
/**
 * Merge a Go-live attestation date into data/panel-settings.json (operator CLI).
 * Usage: node scripts/lib/panel-settings-attest.mjs <field> [YYYY-MM-DD]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.ROOT || process.cwd();
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const FILE = path.join(DATA_DIR, "panel-settings.json");

const ALLOWED = new Set([
  "slaRestoreDrillAt",
  "slaSecretRotationAt",
  "slaCapacityReviewAt",
  "slaIncidentRunbookAckAt",
  "slaPentestAckAt",
]);

const field = process.argv[2];
const dateArg = process.argv[3];
const date =
  dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)
    ? dateArg
    : new Date().toISOString().slice(0, 10);

if (!field || !ALLOWED.has(field)) {
  console.error(
    `Usage: node scripts/lib/panel-settings-attest.mjs <${[...ALLOWED].join("|")}> [YYYY-MM-DD]`,
  );
  process.exit(1);
}

let stored = {};
try {
  stored = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (err) {
  if (err && typeof err === "object" && "code" in err && err.code !== "ENOENT") {
    throw err;
  }
}

stored[field] = date;
fs.mkdirSync(DATA_DIR, { recursive: true });
const tmp = `${FILE}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tmp, FILE);
console.log(`[panel-settings] ${field}=${date} (${FILE})`);
