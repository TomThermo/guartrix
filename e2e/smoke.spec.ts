/**
 * Playwright smoke — not run by Vitest / default CI.
 *
 *   npx playwright install chromium
 *   E2E_BASE_URL=http://127.0.0.1:80 \
 *   E2E_USER=admin E2E_PASSWORD=… \
 *   npx playwright test e2e/smoke.spec.ts
 *
 * Without E2E_BASE_URL the suite is skipped so unit tests remain the CI gate.
 */
import { test, expect } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL?.trim();
const user = process.env.E2E_USER?.trim() || "admin";
const password = process.env.E2E_PASSWORD?.trim() || "";

test.describe("panel smoke", () => {
  test.skip(!baseUrl, "Set E2E_BASE_URL to a running panel");

  test("loads the login or app shell", async ({ page }) => {
    await page.goto(baseUrl!);
    await expect(page.locator("body")).toBeVisible();
  });

  test("login → dashboard", async ({ page }) => {
    test.skip(!password, "Set E2E_PASSWORD for authenticated smoke");
    await page.goto(baseUrl!);
    // Already authenticated session → dashboard
    if (await page.getByRole("link", { name: /dashboard|servers/i }).first().isVisible().catch(() => false)) {
      await expect(page.locator("body")).toBeVisible();
      return;
    }
    await page.getByLabel(/username|email/i).first().fill(user);
    await page.getByLabel(/^password$/i).first().fill(password);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    // 2FA step may appear — skip full path if so
    const totp = page.getByLabel(/authenticator|code|2fa/i);
    if (await totp.isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: "note",
        description: "2FA required — extend with E2E_TOTP for full path",
      });
      return;
    }
    await expect(page).toHaveURL(/\/(servers|dashboard|$)/i, { timeout: 15_000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("open first server console when available", async ({ page }) => {
    test.skip(!password, "Set E2E_PASSWORD for authenticated smoke");
    await page.goto(baseUrl!);
    if (!(await page.getByLabel(/^password$/i).first().isVisible().catch(() => false))) {
      // may already be in-app
    } else {
      await page.getByLabel(/username|email/i).first().fill(user);
      await page.getByLabel(/^password$/i).first().fill(password);
      await page.getByRole("button", { name: /sign in|log in|login/i }).click();
      const totp = page.getByLabel(/authenticator|code|2fa/i);
      if (await totp.isVisible().catch(() => false)) return;
    }
    const serverLink = page.locator('a[href*="/servers/"]').first();
    if (!(await serverLink.isVisible().catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "No servers listed — create one to exercise console",
      });
      return;
    }
    await serverLink.click();
    await expect(page).toHaveURL(/\/servers\//, { timeout: 15_000 });
    const consoleTab = page.getByRole("tab", { name: /console/i }).or(
      page.getByRole("link", { name: /console/i }),
    ).or(page.getByRole("button", { name: /console/i }));
    if (await consoleTab.first().isVisible().catch(() => false)) {
      await consoleTab.first().click();
    }
    await expect(page.locator("body")).toBeVisible();
  });
});
