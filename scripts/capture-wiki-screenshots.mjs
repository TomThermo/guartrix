#!/usr/bin/env node
/**
 * Capture wiki / README screenshots from the live panel.
 *
 * Usage:
 *   GUARTRIX_USER=admin GUARTRIX_PASS='…' node scripts/capture-wiki-screenshots.mjs
 *
 * Requires: puppeteer installed in /tmp/gx-shot (or PUPPETEER_MODULE).
 */
import { createRequire } from "node:module";
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
const SERVER_ID = process.env.GUARTRIX_SERVER_ID || "cgksNsMXCnTQ";

if (!PASS) {
  console.error("Set GUARTRIX_PASS or ADMIN_PASSWORD in .env");
  process.exit(1);
}

const puppeteerPath =
  process.env.PUPPETEER_MODULE || "/tmp/gx-shot/node_modules/puppeteer";
const require = createRequire(import.meta.url);
const puppeteer = require(puppeteerPath);

fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name, opts = {}) {
  const dest = path.join(OUT, name);
  await page.waitForTimeout?.(200).catch(() => {});
  await new Promise((r) => setTimeout(r, opts.delay ?? 400));
  await page.screenshot({
    path: dest,
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
  await page.evaluate(() => {
    document.querySelectorAll(".modal.show .btn-close, .modal.show [data-bs-dismiss='modal']").forEach((b) => b.click());
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
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

  // --- Public pages ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await shot(page, "01-login.png");

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle2" });
  await shot(page, "17-register.png");

  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle2" });
  await shot(page, "23-forgot-password.png");

  // --- Login ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[name="username"], input[type="text"], #username');
  const userSel =
    (await page.$('input[name="username"]')) ? 'input[name="username"]'
    : (await page.$("#username")) ? "#username"
    : 'input[type="text"]';
  const passSel =
    (await page.$('input[name="password"]')) ? 'input[name="password"]'
    : (await page.$("#password")) ? "#password"
    : 'input[type="password"]';
  await page.click(userSel, { clickCount: 3 });
  await page.type(userSel, USER, { delay: 20 });
  await page.click(passSel, { clickCount: 3 });
  await page.type(passSel, PASS, { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"], .btn-primary'),
  ]);
  await new Promise((r) => setTimeout(r, 1200));
  if (page.url().includes("/login")) {
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

  // License (missing before)
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

  // Engine / Modpacks / Bots (missing from older set)
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

  // Clone modal (new)
  await page.goto(`${serverBase}?tab=console`, { waitUntil: "networkidle2" });
  if (await clickText(page, "Clone")) {
    await new Promise((r) => setTimeout(r, 700));
    await shot(page, "34-server-clone-modal.png", { fullPage: false });
    await dismissModals(page);
  }

  // Whitelist toggle modal from header chip if present
  await page.goto(`${serverBase}?tab=console`, { waitUntil: "networkidle2" });
  const wl = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, a, .chip, .badge, .btn")].find((n) =>
      /whitelist/i.test(n.textContent || ""),
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

  // Addon version picker — open first Install / Change version if present
  await page.goto(`${serverBase}?tab=addons`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  if (
    (await clickText(page, "Change version")) ||
    (await clickText(page, "Install"))
  ) {
    await new Promise((r) => setTimeout(r, 1200));
    await shot(page, "36-addon-version-picker.png", { fullPage: false });
    await dismissModals(page);
  }

  // Import page / modal if linked from create
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  if (await clickText(page, "Import")) {
    await new Promise((r) => setTimeout(r, 800));
    await shot(page, "37-import-server.png");
    await dismissModals(page);
  }

  await browser.close();
  console.log("done →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
