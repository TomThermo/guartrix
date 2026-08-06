import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/api/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    environment: "node",
    // config.ts refuses weak ADMIN_PASSWORD / SESSION_SECRET without this.
    env: {
      ALLOW_INSECURE_DEFAULTS: "1",
      SESSION_SECRET:
        process.env.SESSION_SECRET || "vitest-session-secret-xxxxxxxx",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "changeme",
    },
    coverage: {
      provider: "v8",
      include: [
        "apps/api/src/auth/csrf.ts",
        "apps/api/src/auth/api-rate-limit.ts",
        "apps/api/src/auth/password-hash.ts",
        "apps/api/src/auth/password-policy.ts",
        "apps/api/src/safe-url.ts",
        "packages/shared/src/daemon-jwt.ts",
        "apps/api/src/servers/server-access.ts",
        "packages/shared/src/permissions.ts",
        "packages/shared/src/bytes.ts",
        "packages/shared/src/world-seed-urls.ts",
        "packages/shared/src/license-ticket.ts",
        "apps/web/src/components/file-manager/file-permissions.ts",
        "apps/web/src/components/file-manager/paths.ts",
      ],
      exclude: ["**/*.test.ts", "**/node_modules/**"],
      // Floor for included security / pure helpers (raises as more paths are tested).
      thresholds: {
        lines: 95,
        functions: 90,
        statements: 95,
      },
    },
  },
});
