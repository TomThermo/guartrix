#!/usr/bin/env node
/** Generate apps/api/src/infra/mail-template-content.ts from apps/api/src/mail-templates/* */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "apps/api/src/mail-templates");
const out = path.join(root, "apps/api/src/infra/mail-template-content.ts");
const files = fs.readdirSync(dir).filter((f) => /\.(html|txt)$/.test(f)).sort();
const lines = [
  "/** Auto-generated from apps/api/src/mail-templates/* — run: node scripts/generate-mail-templates.mjs */",
  "",
  "export const MAIL_TEMPLATE_FILES: Record<string, string> = {",
];
for (const f of files) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  lines.push(`  ${JSON.stringify(f)}: ${JSON.stringify(raw)},`);
}
lines.push("};", "");
fs.writeFileSync(out, lines.join("\n"));
console.log(`[mail-templates] wrote ${path.relative(root, out)} (${files.length} files)`);
