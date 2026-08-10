import { expect, test } from "@playwright/test";

const adminUser = process.env.E2E_USER || process.env.E2E_ADMIN_USER || "admin";
const adminPassword =
  process.env.E2E_PASSWORD ||
  process.env.E2E_ADMIN_PASSWORD ||
  process.env.ADMIN_PASSWORD ||
  "changeme";

test.describe("Guartrix panel smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|inloggen/i })).toBeVisible();
  });

  test("admin can sign in and reach dashboard", async ({ page }) => {
    test.skip(process.env.E2E_LOGIN !== "1", "Set E2E_LOGIN=1 for authenticated smoke");
    await page.goto("/login");
    await page.locator("#username").fill(adminUser);
    await page.locator("#password").fill(adminPassword);
    await page.getByRole("button", { name: /sign in|inloggen/i }).click();

    const totp = page.locator("#totp-code input, input[autocomplete='one-time-code']");
    if (await totp.isVisible().catch(() => false)) {
      test.skip(true, "Admin 2FA enabled — disable for CI or set E2E_TOTP");
    }

    await expect(page).not.toHaveURL(/\/login$/, { timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(/incorrect|invalid credentials/i);
  });
});
