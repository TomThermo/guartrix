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
    coverage: {
      provider: "v8",
      include: [
        "apps/api/src/auth/csrf.ts",
        "apps/api/src/auth/api-rate-limit.ts",
        "apps/api/src/auth/password-hash.ts",
        "apps/api/src/safe-url.ts",
        "packages/shared/src/daemon-jwt.ts",
        "apps/api/src/servers/server-access.ts",
      ],
      exclude: ["**/*.test.ts", "**/node_modules/**"],
      // Floor for critical security modules (raises as more fetchPinned paths are tested).
      thresholds: {
        lines: 75,
        functions: 70,
        statements: 75,
      },
    },
  },
});
