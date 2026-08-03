/**
 * Playwright smoke skeleton — not run by Vitest / default CI.
 *
 * Requires a running panel and browser binaries:
 *   npx playwright install chromium
 *   E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test e2e/smoke.spec.ts
 *
 * Skip until those env/deps are present; keep unit tests (vitest) as the P0 gate.
 */
import { test, expect } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL?.trim();

test.describe("panel smoke", () => {
  test.skip(!baseUrl, "Set E2E_BASE_URL to a running panel (e.g. http://127.0.0.1:5173)");

  test("loads the login or app shell", async ({ page }) => {
    await page.goto(baseUrl!);
    await expect(page.locator("body")).toBeVisible();
  });
});
