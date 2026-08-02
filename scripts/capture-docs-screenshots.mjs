/**
 * Capture Guartrix UI screenshots for docs/wiki/assets.
 *
 * Prefer local HTTPS so Secure session cookies work when
 * PUBLIC_BASE_URL is https://… (SESSION_SECURE / secure cookies).
 *
 *   DOCS_BASE_URL=https://127.0.0.1 \
 *   ADMIN_USER=admin ADMIN_PASS='…' \
 *   node scripts/capture-docs-screenshots.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/wiki/assets");
fs.mkdirSync(outDir, { recursive: true });

const BASE = (process.env.DOCS_BASE_URL || "https://127.0.0.1").replace(/\/$/, "");
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "";
if (!PASS) {
  console.error("Set ADMIN_PASS");
  process.exit(1);
}

function findChrome() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }
  const cacheRoot = "/tmp/cursor-sandbox-cache";
  if (!fs.existsSync(cacheRoot)) return undefined;
  for (const d of fs.readdirSync(cacheRoot)) {
    const p = path.join(
      cacheRoot,
      d,
      "playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
    );
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", path.basename(file));
}

function serversFromPayload(sj) {
  if (Array.isArray(sj)) return sj;
  if (Array.isArray(sj?.servers)) return sj.servers;
  return [];
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChrome(),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  {
    const pub = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const p = await pub.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await shot(p, "01-login");
    await p.goto(`${BASE}/register`, { waitUntil: "networkidle" });
    await shot(p, "17-register");
    await p.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
    await shot(p, "23-forgot-password");
    await pub.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    baseURL: BASE,
    ignoreHTTPSErrors: true,
  });

  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { username: USER, password: PASS, rememberMe: true },
    headers: { Origin: BASE, Referer: `${BASE}/login` },
  });
  if (!login.ok()) {
    throw new Error(`Login failed HTTP ${login.status()}: ${await login.text()}`);
  }
  const cookies = (await context.storageState()).cookies;
  if (!cookies.length) {
    throw new Error(
      "Login OK but no cookies — use https://127.0.0.1 when SESSION_SECURE / PUBLIC_BASE_URL is https",
    );
  }
  console.log("cookies", cookies.map((c) => c.name).join(", "));

  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  if (page.url().includes("/login")) {
    throw new Error("Session cookie not accepted by web UI");
  }
  await shot(page, "02-dashboard");

  await page.goto(`${BASE}/servers/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot(page, "03-create-server");

  await page.goto(`${BASE}/users`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await shot(page, "04-users");

  await page.goto(`${BASE}/admin/system`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shot(page, "05-system-nodes");

  const addBtn = page.getByRole("button", { name: /Add node/i }).first();
  if ((await addBtn.count()) > 0) {
    await addBtn.click();
    await page.waitForTimeout(600);
    await shot(page, "06-add-node-modal");
    const cancel = page.getByRole("button", { name: /Cancel/i }).first();
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  await page.goto(`${BASE}/statusline`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "07-statusline");

  const serversRes = await context.request.get("/api/servers");
  const servers = serversFromPayload(await serversRes.json());
  const first = servers[0];
  if (first?.id) {
    await page.goto(`${BASE}/servers/${first.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await shot(page, "08-server-console");

    async function openTab(label, file) {
      const link = page.locator(".server-side-nav-link", { hasText: label }).first();
      if ((await link.count()) === 0) {
        console.warn("tab missing:", label);
        return;
      }
      await link.click();
      await page.waitForTimeout(800);
      await shot(page, file);
    }

    // Prefer Mods (Fabric/Forge/…); fall back to Plugins (Paper/…).
    const modsLink = page.locator(".server-side-nav-link", { hasText: "Mods" }).first();
    const pluginsLink = page.locator(".server-side-nav-link", { hasText: "Plugins" }).first();
    const addonLabel = (await modsLink.count()) > 0 ? "Mods" : (await pluginsLink.count()) > 0 ? "Plugins" : null;

    await openTab("File Manager", "09-server-files");
    await openTab("SFTP", "10-server-sftp");
    await openTab("Databases", "13-server-databases");
    await openTab("Network", "24-server-network");
    await openTab("Backups", "11-server-backups");
    await openTab("Subusers", "16-server-subusers");
    await openTab("Server Properties", "15-server-settings");
    if (addonLabel) await openTab(addonLabel, "12-server-addons");
    await openTab("Whitelist Manager", "18-server-whitelist");
    await openTab("Online Players", "14-server-players");
    await openTab("Bans", "19-server-bans");
    await openTab("Schedules", "20-server-schedules");
    await openTab("Activity Log", "30-server-activity");
    await openTab("Log Files", "21-server-audit");
    await openTab("Resources", "22-server-resources");

    const moveBtn = page.getByRole("button", { name: /^Move$/i }).first();
    if ((await moveBtn.count()) > 0 && (await moveBtn.isVisible().catch(() => false))) {
      await moveBtn.click();
      await page.waitForTimeout(600);
      await shot(page, "25-server-move-modal");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  } else {
    console.warn("No servers in API — skipping server screenshots");
  }

  await page.goto(`${BASE}/admin/activity`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shot(page, "26-admin-activity");

  await page.goto(`${BASE}/account/security`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shot(page, "27-account-security");

  await page.goto(`${BASE}/account/billing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shot(page, "28-account-billing");

  await page.goto(`${BASE}/admin/billing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await shot(page, "29-admin-billing");

  await browser.close();
  console.log("done →", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
