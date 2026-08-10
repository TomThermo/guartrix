import type { WikiArticle } from "../wiki-types";

export const internalsArticles: WikiArticle[] = [
  {
    slug: "env-reference",
    title: "Environment variables",
    summary: "Panel `.env` and daemon env file knobs — paths differ for local vs remote nodes.",
    category: "Reference",
    keywords: ["env", "environment", "DATABASE_URL", "REDIS", "daemon.env", "registration"],
    sourcePath: "docs/wiki/env-reference.md",
    relatedSlugs: ["install-panel", "architecture", "operations"],
    sections: [],
  },
  {
    slug: "release-builds",
    title: "Release builds and downloads",
    summary:
      "Minified customer bundles, password-protected /download zips, and what is stripped from ship trees.",
    category: "Reference",
    keywords: ["release", "download", "obfuscate", "zip", "customer"],
    sourcePath: "docs/wiki/release-builds.md",
    relatedSlugs: ["prod-web-downloads", "build-release-internals", "licensing"],
    sections: [],
  },
  {
    slug: "development",
    title: "Development",
    summary:
      "Run the monorepo locally, understand where features live, and use the build, test, and OpenAPI maintenance workflows.",
    category: "Reference",
    keywords: ["development", "dev", "vite", "fastify", "tests", "openapi"],
    sourcePath: "docs/wiki/development.md",
    relatedSlugs: ["api-surface-map", "build-release-internals", "daemon-api"],
    sections: [],
  },
  {
    slug: "daemon-api",
    title: "Daemon API",
    summary:
      "See how the node-local daemon handles files, MySQL, firewall actions, WebSockets, health, and authenticated control traffic.",
    category: "Reference",
    keywords: ["daemon", "api", "health", "ready", "files", "mysql", "firewall", "websocket"],
    sourcePath: "docs/wiki/daemon-api.md",
    relatedSlugs: ["install-nodes", "node-agent-internals", "auth-session-internals"],
    sections: [],
  },
  {
    slug: "node-agent-internals",
    title: "Node-agent internals",
    summary:
      "Understand the host runtime behind the daemon: Docker lifecycle, quotas, jailed files, SFTP, firewall, and player history.",
    category: "Reference",
    keywords: ["node-agent", "docker", "sftp", "jail", "quota", "mysql", "firewall"],
    sourcePath: "docs/wiki/node-agent-internals.md",
    relatedSlugs: ["daemon-api", "files-backups", "networking-allocations"],
    sections: [],
  },
  {
    slug: "shared-contracts",
    title: "Shared contracts",
    summary:
      "Explore the shared types, permissions, activity taxonomy, daemon JWTs, and license verification helpers used across services.",
    category: "Reference",
    keywords: ["shared", "contracts", "permissions", "activity", "daemon jwt", "license ticket"],
    sourcePath: "docs/wiki/shared-contracts.md",
    relatedSlugs: ["api-surface-map", "auth-session-internals", "license-flow"],
    sections: [],
  },
  {
    slug: "auth-session-internals",
    title: "Auth and session internals",
    summary:
      "See how sessions, TOTP, invites, reset tokens, API keys, app passwords, and daemon auth fit together.",
    category: "Reference",
    keywords: ["auth", "sessions", "2fa", "invites", "app passwords", "daemon jwt"],
    sourcePath: "docs/wiki/auth-and-session-internals.md",
    relatedSlugs: ["accounts-quotas", "api-documentation"],
    sections: [],
  },
  {
    slug: "billing-internals",
    title: "Billing internals",
    summary:
      "Understand plan templates, Mollie payment state, quota application, subscriptions, and machine-facing provisioning flows.",
    category: "Reference",
    keywords: ["billing", "plans", "mollie", "subscriptions", "payments", "quotas"],
    sourcePath: "docs/wiki/billing-internals.md",
    relatedSlugs: ["api-documentation", "accounts-quotas", "licensing"],
    sections: [],
  },
  {
    slug: "license-flow",
    title: "License flow internals",
    summary:
      "Follow the signed validate flow from panel usage reporting to daemon ticket verification and free-tier fallback.",
    category: "Reference",
    keywords: ["license flow", "validate", "ticket", "free tier", "claims", "public key"],
    sourcePath: "docs/wiki/license-flow-internals.md",
    relatedSlugs: ["licensing", "daemon-api", "shared-contracts"],
    sections: [],
  },
  {
    slug: "api-surface-map",
    title: "API and surface map",
    summary:
      "Find where Guartrix features live across UI pages, API route families, daemon routes, shared packages, scripts, and data-model domains.",
    category: "Reference",
    keywords: ["surface map", "routes", "ui pages", "daemon routes", "scripts", "prisma"],
    sourcePath: "docs/wiki/api-surface-map.md",
    relatedSlugs: ["daemon-api", "shared-contracts", "development"],
    sections: [],
  },
  {
    slug: "build-release-internals",
    title: "Build and release internals",
    summary:
      "See how Guartrix creates build trees, release tarballs, customer packages, and downloadable bundles.",
    category: "Reference",
    keywords: ["build", "release", "build-out", "staging", "tarball", "download bundle"],
    sourcePath: "docs/wiki/build-and-release-internals.md",
    relatedSlugs: ["operations", "prod-web-downloads", "development"],
    sections: [],
  },
  {
    slug: "prod-web-downloads",
    title: "Prod-web and downloads",
    summary:
      "Understand the production edge server, static serving, reverse proxy, TLS handling, and optional `/download` integration.",
    category: "Reference",
    keywords: ["prod-web", "download", "reverse proxy", "tls", "static", "edge"],
    sourcePath: "docs/wiki/prod-web-and-downloads.md",
    relatedSlugs: ["build-release-internals", "operations", "install-panel"],
    sections: [],
  },
  {
    slug: "notifications-alerts",
    title: "Notifications and alerts",
    summary:
      "See how Guartrix uses email, webhooks, Web Push, and in-panel warnings for operational and account notifications.",
    category: "Reference",
    keywords: ["notifications", "alerts", "webhook", "email", "push", "activity"],
    sourcePath: "docs/wiki/notifications-and-alerts.md",
    relatedSlugs: ["activity-log", "panel-settings", "security"],
    sections: [],
  },
];
