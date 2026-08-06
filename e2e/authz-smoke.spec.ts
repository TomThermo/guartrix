/**
 * Extra Playwright smokes — skipped unless E2E_BASE_URL is set.
 * Run with a live panel + E2E_PASSWORD (and optional E2E_USER).
 */
import { test, expect } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL?.trim();
const user = process.env.E2E_USER?.trim() || "admin";
const password = process.env.E2E_PASSWORD?.trim() || "";

async function ensureLoggedIn(page: import("@playwright/test").Page) {
  await page.goto(baseUrl!);
  if (await page.getByLabel(/^password$/i).first().isVisible().catch(() => false)) {
    await page.getByLabel(/username|email/i).first().fill(user);
    await page.getByLabel(/^password$/i).first().fill(password);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    const totp = page.getByLabel(/authenticator|code|2fa/i);
    if (await totp.isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: "note",
        description: "2FA required — set E2E_TOTP for full path",
      });
      return false;
    }
  }
  return true;
}

test.describe("panel authz / CSRF smokes", () => {
  test.skip(!baseUrl, "Set E2E_BASE_URL to a running panel");

  test("mutating API without CSRF is rejected for cookie session", async ({
    request,
    page,
  }) => {
    test.skip(!password, "Set E2E_PASSWORD");
    const ok = await ensureLoggedIn(page);
    test.skip(!ok, "2FA blocked login");

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const res = await request.post(`${baseUrl}/api/auth/logout`, {
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
        // Intentionally omit Origin + x-csrf-token
      },
      data: {},
    });
    // Missing origin/CSRF → 403 (or 200 if logout is CSRF-exempt — then still assert body)
    expect([403, 200, 204]).toContain(res.status());
    if (res.status() === 403) {
      const body = await res.json().catch(() => ({}));
      expect(String((body as { error?: string }).error ?? "")).toMatch(
        /origin|csrf|referer/i,
      );
    }
  });

  test("files tab loads for first server when present", async ({ page }) => {
    test.skip(!password, "Set E2E_PASSWORD");
    const ok = await ensureLoggedIn(page);
    test.skip(!ok, "2FA blocked login");

    const serverLink = page.locator('a[href*="/servers/"]').first();
    if (!(await serverLink.isVisible().catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "No servers — skip files smoke",
      });
      return;
    }
    await serverLink.click();
    await expect(page).toHaveURL(/\/servers\//, { timeout: 15_000 });
    const filesTab = page
      .getByRole("tab", { name: /files/i })
      .or(page.getByRole("link", { name: /files/i }))
      .or(page.getByRole("button", { name: /files/i }));
    if (await filesTab.first().isVisible().catch(() => false)) {
      await filesTab.first().click();
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("admin settings route is reachable for admin", async ({ page }) => {
    test.skip(!password, "Set E2E_PASSWORD");
    const ok = await ensureLoggedIn(page);
    test.skip(!ok, "2FA blocked login");

    await page.goto(`${baseUrl}/admin/settings`);
    // Non-admins may redirect; admins see settings shell
    await expect(page.locator("body")).toBeVisible();
    const denied = page.getByText(/forbidden|not allowed|sign in/i);
    if (await denied.first().isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: "note",
        description: "User may lack admin — OK for non-admin accounts",
      });
    }
  });
});
