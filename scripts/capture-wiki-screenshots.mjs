#!/usr/bin/env node
/**
 * Capture wiki / README screenshots from the live panel.
 *
 * Usage:
 *   GUARTRIX_USER=admin GUARTRIX_PASS='…' GUARTRIX_SERVER_ID=… \
 *   GUARTRIX_TOTP_FROM_DB=1 \
 *     node scripts/capture-wiki-screenshots.mjs
 *
 * Optional:
 *   GUARTRIX_DEMO_SERVER_NAME=server1  — hide other servers on dashboard
 *   GUARTRIX_SCRUB_IPS=1               — replace public IPv4 with 127.0.0.1
 *   GUARTRIX_PLACEHOLDER_PLAYERS=1     — mock online/history player APIs
 *   GUARTRIX_TOTP_FROM_DB=1            — load/unseal admin TOTP from panel DB
 *   GUARTRIX_TOTP_SECRET               — base32 secret (when not using FROM_DB)
 *   GUARTRIX_TOTP                      — one-shot 6-digit code (overrides secret)
 *
 * Requires: puppeteer installed in /tmp/gx-shot (or PUPPETEER_MODULE).
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs/wiki/assets");
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

const BASE = process.env.GUARTRIX_BASE_URL || "https://guartrix.com";
const USER = process.env.GUARTRIX_USER || process.env.ADMIN_USERNAME || "admin";
const PASS = process.env.GUARTRIX_PASS || process.env.ADMIN_PASSWORD || "";
const SERVER_ID = process.env.GUARTRIX_SERVER_ID || "";
const DEMO_NAME = process.env.GUARTRIX_DEMO_SERVER_NAME || "server1";
const SCRUB_IPS = process.env.GUARTRIX_SCRUB_IPS !== "0";
const PLACEHOLDER_PLAYERS = process.env.GUARTRIX_PLACEHOLDER_PLAYERS !== "0";
const TOTP_FROM_DB =
  process.env.GUARTRIX_TOTP_FROM_DB === "1" ||
  process.env.GUARTRIX_TOTP_FROM_DB === "true";
let TOTP_SECRET = (process.env.GUARTRIX_TOTP_SECRET || "").trim();
const TOTP_CODE = (process.env.GUARTRIX_TOTP || "").trim();

if (!PASS) {
  console.error("Set GUARTRIX_PASS or ADMIN_PASSWORD in .env");
  process.exit(1);
}
if (!SERVER_ID) {
  console.error("Set GUARTRIX_SERVER_ID to the demo server id");
  process.exit(1);
}

const TOTP_ENC_PREFIX = "enc:v1:";

function unsealTotpSecret(stored) {
  if (!stored.startsWith(TOTP_ENC_PREFIX)) return stored;
  const secret =
    process.env.SESSION_SECRET?.trim() || "dev-session-secret-change-me";
  const key = crypto.scryptSync(secret, "guartrix-totp-v1", 32);
  const raw = Buffer.from(stored.slice(TOTP_ENC_PREFIX.length), "base64url");
  if (raw.length < 28) throw new Error("Corrupt TOTP secret");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

async function loadTotpSecretFromDb() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { username: USER },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpEnabled || !user.totpSecret) {
      throw new Error(`User ${USER} has no enabled TOTP secret in DB`);
    }
    return unsealTotpSecret(user.totpSecret);
  } finally {
    await prisma.$disconnect();
  }
}

/** RFC 6238 TOTP (SHA-1, 30s, 6 digits) from base32 secret. */
function generateTotp(base32Secret, nowMs = Date.now()) {
  const cleaned = base32Secret.replace(/\s+/g, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of cleaned) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(nowMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function resolveTotpCode() {
  if (/^\d{6}$/.test(TOTP_CODE)) return TOTP_CODE;
  if (TOTP_SECRET) return generateTotp(TOTP_SECRET);
  return null;
}

const puppeteerPath =
  process.env.PUPPETEER_MODULE || "/tmp/gx-shot/node_modules/puppeteer";
const require = createRequire(import.meta.url);
const puppeteer = require(puppeteerPath);

fs.mkdirSync(OUT, { recursive: true });

/** Well-known demo UUIDs (Steve / Alex style placeholders — not real accounts). */
const PLACEHOLDERS = {
  online: [
    { name: "Steve", uuid: "8667ba71-b85a-4004-af54-457a9734eed7" },
    { name: "Alex", uuid: "ec561538-f3fd-461d-aff5-086b22154bce" },
  ],
  history: [
    {
      name: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      firstSeenAt: "2026-01-10T12:00:00.000Z",
      lastSeenAt: "2026-01-12T18:30:00.000Z",
      lastJoinedAt: "2026-01-12T17:00:00.000Z",
      lastLeftAt: "2026-01-12T18:30:00.000Z",
      online: false,
    },
    {
      name: "Herobrine",
      uuid: "f84c6a79-0a4e-45e0-834d-1e55c0abcabc",
      firstSeenAt: "2026-01-08T09:00:00.000Z",
      lastSeenAt: "2026-01-09T09:00:00.000Z",
      lastJoinedAt: "2026-01-09T08:00:00.000Z",
      lastLeftAt: "2026-01-09T09:00:00.000Z",
      online: false,
    },
  ],
};

async function sanitizePage(page) {
  await page.evaluate(
    ({ demoName, scrubIps }) => {
      // Hide other servers on the dashboard list
      for (const row of document.querySelectorAll(".server-row")) {
        const nameEl = row.querySelector(".server-row-name");
        const name = (nameEl?.textContent || row.textContent || "").trim();
        if (!new RegExp(`\\b${demoName}\\b`, "i").test(name)) {
          row.remove();
        }
      }
      // Fix "n/n" counters after hiding rows
      const visible = document.querySelectorAll(".server-row").length;
      for (const el of document.querySelectorAll("body *")) {
        if (!el.childElementCount && /^\d+\s*\/\s*\d+$/.test((el.textContent || "").trim())) {
          if (visible > 0) el.textContent = `${visible}/${visible}`;
        }
      }

      if (!scrubIps) return;

      const ipRe =
        /\b(?!127\.0\.0\.1)(?:\d{1,3}\.){3}\d{1,3}\b/g;
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (ipRe.test(node.nodeValue || "")) {
            node.nodeValue = (node.nodeValue || "").replace(ipRe, "127.0.0.1");
          }
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
        for (const child of [...node.childNodes]) walk(child);
      };
      walk(document.body);

      // Scrub common real hostnames that leak in join/SFTP cards when unwanted
      for (const el of document.querySelectorAll(".font-monospace, code, .join-card, .server-row-meta")) {
        if (!el.childElementCount && el.textContent) {
          el.textContent = el.textContent
            .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, (m) =>
              m === "127.0.0.1" ? m : "127.0.0.1",
            );
        }
      }
    },
    { demoName: DEMO_NAME, scrubIps: SCRUB_IPS },
  );
}

async function waitForIcons(page) {
  await page
    .evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
}

async function shot(page, name, opts = {}) {
  await new Promise((r) => setTimeout(r, opts.delay ?? 400));
  await waitForIcons(page);
  await sanitizePage(page);
  await page.screenshot({
    path: path.join(OUT, name),
    fullPage: opts.fullPage ?? true,
  });
  console.log("wrote", name);
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((text) => {
    const nodes = [
      ...document.querySelectorAll(
        "button, a, .nav-link, [role='tab'], .list-group-item, .server-nav a, .server-sidebar a",
      ),
    ];
    const el = nodes.find(
      (n) => (n.textContent || "").replace(/\s+/g, " ").trim() === text,
    );
    if (!el) return false;
    el.click();
    return true;
  }, label);
  if (!clicked) console.warn("tab not found:", label);
  await new Promise((r) => setTimeout(r, 800));
  return clicked;
}

async function clickText(page, text, selector = "button, a, .btn, .nav-link") {
  const clicked = await page.evaluate(
    ({ text, selector }) => {
      const nodes = [...document.querySelectorAll(selector)];
      const el = nodes.find((n) =>
        (n.textContent || "").replace(/\s+/g, " ").trim().includes(text),
      );
      if (!el) return false;
      el.click();
      return true;
    },
    { text, selector },
  );
  await new Promise((r) => setTimeout(r, 600));
  return clicked;
}

async function dismissModals(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page
    .evaluate(() => {
      document
        .querySelectorAll(
          ".modal.show .btn-close, .modal.show [data-bs-dismiss='modal']",
        )
        .forEach((b) => b.click());
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1440,900",
      "--ignore-certificate-errors",
    ],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);

  if (TOTP_FROM_DB) {
    TOTP_SECRET = await loadTotpSecretFromDb();
    console.log("Loaded TOTP secret from DB for", USER);
  }

  if (PLACEHOLDER_PLAYERS) {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      try {
        if (
          req.method() === "GET" &&
          /\/api\/servers\/[^/]+\/online(?:\?|$)/.test(url)
        ) {
          const body = {
            online: true,
            playersOnline: PLACEHOLDERS.online.length,
            playersMax: 20,
            players: PLACEHOLDERS.online,
            history: PLACEHOLDERS.history,
            source: "console",
            latencyMs: 12,
          };
          void req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
          return;
        }
        if (
          req.method() === "GET" &&
          /\/api\/servers\/online(?:\?|$)/.test(url)
        ) {
          const body = {
            [SERVER_ID]: {
              online: true,
              playersOnline: PLACEHOLDERS.online.length,
              playersMax: 20,
              players: PLACEHOLDERS.online,
              history: [],
              source: "console",
              latencyMs: 12,
            },
          };
          void req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
          return;
        }
      } catch {
        // fall through
      }
      void req.continue();
    });
  }

  // --- Public pages ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await shot(page, "01-login.png", { fullPage: false });
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle2" });
  await shot(page, "17-register.png", { fullPage: false });
  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle2" });
  await shot(page, "23-forgot-password.png", { fullPage: false });

  // --- Login ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector(
    'input[name="username"], input[type="text"], #username',
  );
  const userSel = (await page.$('input[name="username"]'))
    ? 'input[name="username"]'
    : (await page.$("#username"))
      ? "#username"
      : 'input[type="text"]';
  const passSel = (await page.$('input[name="password"]'))
    ? 'input[name="password"]'
    : (await page.$("#password"))
      ? "#password"
      : 'input[type="password"]';
  await page.click(userSel, { clickCount: 3 });
  await page.type(userSel, USER, { delay: 20 });
  await page.click(passSel, { clickCount: 3 });
  await page.type(passSel, PASS, { delay: 20 });
  // SPA login — do not wait for navigation (password step stays on /login for 2FA).
  await page.click('button[type="submit"], .btn-primary');
  await page
    .waitForFunction(
      () =>
        Boolean(document.querySelector("#totp-code")) ||
        !location.pathname.includes("/login"),
      { timeout: 60000 },
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 800));

  // Admin 2FA: SPA stays on /login and shows #totp-code.
  const totpInput = await page.$("#totp-code, input[autocomplete='one-time-code']");
  if (totpInput) {
    const code = resolveTotpCode();
    if (!code) {
      console.error(
        "2FA required — set GUARTRIX_TOTP_FROM_DB=1, GUARTRIX_TOTP_SECRET, or GUARTRIX_TOTP=123456",
      );
      await shot(page, "_login-failed.png");
      await browser.close();
      process.exit(2);
    }
    await totpInput.click({ clickCount: 3 });
    await totpInput.type(code, { delay: 20 });
    await page.click('button[type="submit"], .btn-primary');
    await page
      .waitForFunction(() => !location.pathname.includes("/login"), {
        timeout: 60000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
  }

  const stillOnLogin = page.url().includes("/login");
  if (stillOnLogin) {
    console.error("Login failed; still on", page.url());
    await shot(page, "_login-failed.png");
    await browser.close();
    process.exit(2);
  }

  // Dashboard
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await shot(page, "02-dashboard.png");

  // Create server
  await page.goto(`${BASE}/servers/new`, { waitUntil: "networkidle2" });
  await shot(page, "03-create-server.png");

  // Users
  await page.goto(`${BASE}/users`, { waitUntil: "networkidle2" });
  await shot(page, "04-users.png");

  // System / nodes
  await page.goto(`${BASE}/admin/system`, { waitUntil: "networkidle2" });
  await shot(page, "05-system-nodes.png");
  if (await clickText(page, "Add node")) {
    await new Promise((r) => setTimeout(r, 800));
    await shot(page, "06-add-node-modal.png", { fullPage: false });
    await dismissModals(page);
  }

  // Status
  await page.goto(`${BASE}/statusline`, { waitUntil: "networkidle2" });
  await shot(page, "07-statusline.png");

  // Admin activity
  await page.goto(`${BASE}/admin/activity`, { waitUntil: "networkidle2" });
  await shot(page, "26-admin-activity.png");

  // License
  await page.goto(`${BASE}/admin/license`, { waitUntil: "networkidle2" });
  await shot(page, "31-admin-license.png");

  // Account
  await page.goto(`${BASE}/account/security`, { waitUntil: "networkidle2" });
  await shot(page, "27-account-security.png");

  await page.goto(`${BASE}/account/billing`, { waitUntil: "networkidle2" });
  await shot(page, "28-account-billing.png");

  await page.goto(`${BASE}/admin/billing`, { waitUntil: "networkidle2" });
  await shot(page, "29-admin-billing.png");

  // Server detail tabs
  const sid = SERVER_ID;
  const serverBase = `${BASE}/servers/${sid}`;

  async function serverTab(tab, file, label) {
    await page.goto(`${serverBase}?tab=${tab}`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));
    if (label) await clickTab(page, label);
    await shot(page, file);
  }

  await serverTab("console", "08-server-console.png", "Console");
  await serverTab("files", "09-server-files.png", "File Manager");
  await serverTab("sftp", "10-server-sftp.png", "SFTP");
  await serverTab("backups", "11-server-backups.png", "Backups");
  await serverTab("addons", "12-server-addons.png", "Plugin Management");
  await serverTab("databases", "13-server-databases.png", "Databases");
  await serverTab("players", "14-server-players.png", "Online Players");
  await serverTab("settings", "15-server-settings.png", "Server Properties");
  await serverTab("subusers", "16-server-subusers.png", "Subusers");
  await serverTab("whitelist", "18-server-whitelist.png", "Whitelist Manager");
  await serverTab("bans", "19-server-bans.png", "Bans");
  await serverTab("tasks", "20-server-schedules.png", "Schedules");
  await serverTab("logs", "21-server-audit.png", "Log Files");
  await serverTab("resources", "22-server-resources.png", "Resources");
  await serverTab("allocations", "24-server-network.png", "Network");
  await serverTab("activity", "30-server-activity.png", "Activity Log");

  await serverTab("engine", "32-server-engine.png", "Engine");
  await serverTab("modpacks", "33-server-modpacks.png", "Modpacks");
  await serverTab("bots", "38-server-bots.png", "Bots");

  // Move modal
  await page.goto(`${serverBase}?tab=console`, { waitUntil: "networkidle2" });
  if (await clickText(page, "Move")) {
    await new Promise((r) => setTimeout(r, 700));
    await shot(page, "25-server-move-modal.png", { fullPage: false });
    await dismissModals(page);
  }

  // Clone modal
  await page.goto(`${serverBase}?tab=console`, { waitUntil: "networkidle2" });
  if (await clickText(page, "Clone")) {
    await new Promise((r) => setTimeout(r, 700));
    await shot(page, "34-server-clone-modal.png", { fullPage: false });
    await dismissModals(page);
  }

  // Whitelist toggle modal
  await page.goto(`${serverBase}?tab=console`, { waitUntil: "networkidle2" });
  const wl = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, a, .chip, .badge, .btn")].find(
      (n) => /WL\s/i.test(n.textContent || "") || /^Whitelist/i.test(n.textContent || ""),
    );
    if (!el) return false;
    el.click();
    return true;
  });
  if (wl) {
    await new Promise((r) => setTimeout(r, 700));
    await shot(page, "35-whitelist-toggle-modal.png", { fullPage: false });
    await dismissModals(page);
  }

  // Addon version picker — prefer title="Change version", else Install
  await page.goto(`${serverBase}?tab=addons`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.press("Escape").catch(() => {});
  let opened = await page.evaluate(() => {
    const btn = document.querySelector('button[title="Change version"]');
    if (btn) {
      btn.click();
      return "change";
    }
    return null;
  });
  if (!opened) {
    // Search + Install for a common Paper plugin
    const search = await page.$('input[type="search"], input[placeholder*="earch"]');
    if (search) {
      await search.click({ clickCount: 3 });
      await search.type("LuckPerms", { delay: 15 });
      await clickText(page, "Search");
      await new Promise((r) => setTimeout(r, 2000));
    }
    opened = (await clickText(page, "Install")) ? "install" : null;
  }
  if (opened) {
    await new Promise((r) => setTimeout(r, 1500));
    await shot(page, "36-addon-version-picker.png", { fullPage: false });
    await dismissModals(page);
  }

  // Import archive tab
  await page.goto(`${BASE}/servers/new`, { waitUntil: "networkidle2" });
  if (
    (await clickText(page, "Import archive")) ||
    (await clickText(page, "Import"))
  ) {
    await new Promise((r) => setTimeout(r, 700));
    await shot(page, "37-import-server.png");
  }

  await browser.close();
  console.log("done →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
