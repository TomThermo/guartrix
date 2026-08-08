import { defineConfig, devices } from "@playwright/test";

/**
 * Optional E2E smoke — not part of default CI (see .github/workflows/ci.yml).
 * Set E2E_BASE_URL and install browsers before running:
 *   npx playwright install chromium
 *   E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    ...devices["Desktop Chrome"],
  },
});
