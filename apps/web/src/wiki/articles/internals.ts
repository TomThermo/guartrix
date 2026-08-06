import type { WikiArticle } from "../wiki-types";

export const internalsArticles: WikiArticle[] = [
  {
    slug: "env-reference",
    title: "Environment variables",
    summary:
      "Panel `.env` and daemon env file knobs — paths differ for local vs remote nodes.",
    category: "Reference",
    keywords: ["env", "environment", "DATABASE_URL", "REDIS", "daemon.env", "registration"],
    sourcePath: "docs/wiki/env-reference.md",
    relatedSlugs: ["install-panel", "architecture", "operations"],
    sections: [
      {
        title: "Where config lives",
        bullets: [
          "Panel: repo root `.env` (from `.env.example`)",
          "Local daemon: `$INSTALL_DIR/data/daemon.env`",
          "Remote daemon-only: `/var/lib/guartrix/daemon.env`",
          "`REGISTRATION_ENABLED` controls open signup; `LETSENCRYPT_EMAIL` for LE helper scripts",
        ],
      },
      {
        title: "Common groups",
        bullets: [
          "Public URL / TLS: PUBLIC_*, HTTPS_*, SESSION_SECURE, TRUST_PROXY, TLS_*",
          "Database: DATABASE_URL / MYSQL_*",
          "Redis HA: REDIS_URL, SESSION_STORE, RATE_LIMIT_STORE",
          "License: LICENSE_SERVER_URL, LICENSE_KEY",
        ],
      },
    ],
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
    sections: [
      {
        title: "Shipping",
        bullets: [
          "`build:release` / `build-out.sh` produce minified API/daemon bundles",
          "Operator download packaging publishes versioned zips for `/download`",
          "Customer trees omit git, sources, and the private license issuer",
        ],
      },
      {
        title: "Download portal",
        paragraphs: [
          "Optional DNS-only `DOWNLOAD_PUBLIC_HOST` avoids Cloudflare bot challenges on zip downloads.",
          "Set `DOWNLOAD_PASSWORD` and restart web after changing download env.",
        ],
      },
    ],
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
    sections: [
      {
        title: "Local workflow",
        code: [
          {
            label: "Run locally",
            language: "bash",
            content:
              "cp .env.example .env\nnpm install\nnpm run db:generate && bash scripts/db-migrate.sh\n\nnpm run dev:api\nnpm run dev:web\nnpm run dev:daemon",
          },
        ],
      },
      {
        title: "Important paths",
        bullets: [
          "`apps/web/src/pages` for route-level UI pages",
          "`apps/api/src/routes` plus domain folders for backend behavior",
          "`apps/daemon/src` as the daemon entrypoint",
          "`packages/node-agent` and `packages/shared` for shared runtime and contracts",
        ],
      },
    ],
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
    sections: [
      {
        title: "Responsibilities",
        bullets: [
          "Container lifecycle and commands",
          "Console and event streams",
          "File access and archives",
          "Node-local MySQL operations",
          "Firewall open/close actions",
          "SFTP hosting",
          "Live stats + ~1h history ring (GET /servers/:id/stats/history; lost on daemon restart)",
          "Resource reporting and license gating",
        ],
      },
      {
        title: "Health and trust boundaries",
        bullets: [
          "`/health` and `/ready` expose daemon status and Docker readiness.",
          "The broader control surface is protected by daemon auth rather than being public.",
        ],
      },
    ],
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
    sections: [
      {
        title: "Subsystems",
        bullets: [
          "Runtime layout and config",
          "Process and container lifecycle",
          "Resource and quota enforcement (incl. ~1h stats-history ring)",
          "Files, archive safety, and SFTP jail",
          "MySQL helper and firewall integration",
          "Player history",
        ],
      },
    ],
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
    sections: [
      {
        title: "What is shared",
        bullets: [
          "Server, node, file/stat, database, schedule, and auth payload shapes",
          "Permission names for subusers and API keys",
          "Activity categories and action keys",
          "Daemon JWT verification helpers",
          "License claim and ticket verification helpers",
        ],
      },
    ],
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
    sections: [
      {
        title: "Auth surfaces",
        bullets: [
          "Session cookie for the browser UI",
          "Personal `gt_` keys for end-user automation",
          "App passwords for SFTP and desktop clients",
          "Machine `gta_` keys for external admin automation",
          "Short-lived daemon JWTs for panel-to-node traffic",
        ],
      },
    ],
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
    sections: [
      {
        title: "Core domains",
        bullets: [
          "Plan templates",
          "Payment rows and statuses",
          "Quota application",
          "Recurring subscription lifecycle",
          "Machine-driven user and server provisioning",
        ],
      },
    ],
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
    sections: [
      {
        title: "Flow overview",
        bullets: [
          "The panel reports usage to the public license API.",
          "The API returns signed claims.",
          "The panel verifies those claims and pushes daemon tickets.",
          "Daemons verify the ticket locally and gate starts accordingly.",
        ],
      },
    ],
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
    sections: [
      {
        title: "What it maps",
        bullets: [
          "Web UI pages",
          "API route families",
          "Daemon route families",
          "Node-agent and shared package subsystems",
          "Operational script families",
          "Prisma model domains",
        ],
      },
      {
        title: "Route families you can look up",
        code: [
          {
            label: "Examples of route groups",
            language: "text",
            content:
              "auth, two-factor, invites, api-keys, app-passwords,\nservers, servers-dashboard, servers-power, servers-settings,\nfiles, backups, databases, sftp-auth,\nnodes, allocations, status, activity,\nbilling, application, license",
          },
        ],
      },
    ],
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
    sections: [
      {
        title: "Main outputs",
        bullets: [
          "Normal development `dist/` builds",
          "Runnable `build/` trees",
          "Release archives and downloadable package bundles",
        ],
      },
      {
        title: "Main scripts",
        bullets: [
          "`scripts/build-out.sh`",
          "`scripts/esbuild-release.mjs`",
          "`scripts/lib-stage-release.sh`",
          "`scripts/package-release.sh`",
          "download-bundle packaging flow",
        ],
      },
    ],
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
    sections: [
      {
        title: "What prod-web does",
        bullets: [
          "Serve the built web UI",
          "Proxy `/api` and `/ws`",
          "Handle HTTP/HTTPS behavior and TLS cert loading",
          "Optionally expose the password-protected `/download` surface on the operator host",
        ],
      },
    ],
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
    sections: [
      {
        title: "Notification channels",
        bullets: [
          "Email for verification, reset, invites, and optional alerts",
          "Activity webhook for critical events and watchdog incidents",
          "Per-server owner Discord webhook / Discord status message (Server Properties → General)",
          "Web Push for account-level browser/device notifications",
          "In-panel banners for license, restart-required, and validation warnings",
        ],
      },
      {
        title: "Operational relevance",
        paragraphs: [
          "Alert delivery settings live partly in panel settings and partly in environment-backed runtime behavior.",
          "Webhook and email notifications help operators notice crashes, node issues, license failures, and other critical platform events quickly.",
        ],
      },
    ],
  },
];
