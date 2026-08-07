#!/usr/bin/env node
/**
 * Create / refresh the wiki-screenshot demo admin (no 2FA, unlimited quotas).
 *
 *   node scripts/ensure-demo-admin.mjs
 *
 * Env:
 *   GUARTRIX_DEMO_USER=demo
 *   GUARTRIX_DEMO_PASS=DemoScreenshots!2026
 *   GUARTRIX_DEMO_SERVER_NAME=server1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { nanoid } from "nanoid";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // optional
  }
}
loadEnvFile();

const USER = process.env.GUARTRIX_DEMO_USER || "demo";
const PASS = process.env.GUARTRIX_DEMO_PASS || "DemoScreenshots!2026";
const DEMO_SERVER = process.env.GUARTRIX_DEMO_SERVER_NAME || "server1";

function apiModuleUrl(rel) {
  const dist = path.join(ROOT, "apps/api/dist", rel);
  if (!fs.existsSync(dist)) {
    throw new Error(`Missing ${dist} — run api build first`);
  }
  return pathToFileURL(dist).href;
}

const { hashPassword } = await import(apiModuleUrl("auth/password-hash.js"));
const prisma = new PrismaClient();

try {
  const existing = await prisma.user.findUnique({ where: { username: USER } });
  if (existing) {
    await prisma.user.update({
      where: { username: USER },
      data: {
        role: "ADMIN",
        passwordHash: hashPassword(PASS),
        totpEnabled: false,
        totpSecret: null,
        totpRecoveryCodes: null,
        emailVerified: true,
        maxServers: null,
        maxMemoryMb: null,
        maxDatabases: null,
      },
    });
    console.log(`updated demo admin "${USER}" (${existing.id})`);
  } else {
    const u = await prisma.user.create({
      data: {
        id: nanoid(12),
        username: USER,
        email: `${USER}@guartrix.local`,
        role: "ADMIN",
        passwordHash: hashPassword(PASS),
        totpEnabled: false,
        emailVerified: true,
        maxServers: null,
        maxMemoryMb: null,
        maxDatabases: null,
      },
    });
    console.log(`created demo admin "${USER}" (${u.id})`);
  }

  const demo = await prisma.user.findUniqueOrThrow({ where: { username: USER } });
  const srv = await prisma.server.findFirst({ orderBy: { createdAt: "asc" } });
  if (srv) {
    await prisma.server.update({
      where: { id: srv.id },
      data: { name: DEMO_SERVER, ownerId: demo.id },
    });
    console.log(`demo server: ${srv.id} → name=${DEMO_SERVER}`);
    console.log(`export GUARTRIX_SERVER_ID=${srv.id}`);
  } else {
    console.warn("No server found — create one before capturing screenshots.");
  }

  const settingsPath = path.join(ROOT, "data/panel-settings.json");
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    raw.twoFactorRequiredRoles = [];
    fs.writeFileSync(settingsPath, `${JSON.stringify(raw, null, 2)}\n`);
    console.log("cleared twoFactorRequiredRoles in panel-settings.json");
  } catch (err) {
    console.warn("panel-settings skip:", err instanceof Error ? err.message : err);
  }

  console.log(`\nLogin: ${USER} / ${PASS} (2FA disabled, not required)`);
} finally {
  await prisma.$disconnect();
}
