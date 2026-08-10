#!/usr/bin/env node
/**
 * Merge Go-live attestation fields into data/panel-settings.json (operator CLI).
 * Usage:
 *   node scripts/lib/panel-settings-attest.mjs slaRestoreDrillAt [YYYY-MM-DD]
 *   node scripts/lib/panel-settings-attest.mjs slaIncidentRunbookAck true
 *   node scripts/lib/panel-settings-attest.mjs slaPentestAck true
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.ROOT || process.cwd();
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const FILE = path.join(DATA_DIR, "panel-settings.json");

const DATE_FIELDS = new Set([
  "slaRestoreDrillAt",
  "slaSecretRotationAt",
  "slaCapacityReviewAt",
]);

const BOOL_FIELDS = new Set(["slaIncidentRunbookAck", "slaPentestAck"]);

const field = process.argv[2];
const valueArg = process.argv[3];

if (!field || (!DATE_FIELDS.has(field) && !BOOL_FIELDS.has(field))) {
  console.error(
    `Usage: node scripts/lib/panel-settings-attest.mjs <${[...DATE_FIELDS, ...BOOL_FIELDS].join("|")}> [value]`,
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

let value;
if (DATE_FIELDS.has(field)) {
  value =
    valueArg && /^\d{4}-\d{2}-\d{2}$/.test(valueArg)
      ? valueArg
      : new Date().toISOString().slice(0, 10);
} else {
  value = !valueArg || valueArg === "true" || valueArg === "1";
}

stored[field] = value;
fs.mkdirSync(DATA_DIR, { recursive: true });
const tmp = `${FILE}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tmp, FILE);
console.log(`[panel-settings] ${field}=${value} (${FILE})`);
