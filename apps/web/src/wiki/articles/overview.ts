import type { WikiArticle } from "../wiki-types";

export const overviewArticles: WikiArticle[] = [
  {
    slug: "overview",
    title: "Guartrix overview",
    summary:
      "A high-level introduction to the panel, daemon, supported server types, architecture, requirements, and documentation entry points.",
    category: "Overview",
    keywords: ["overview", "readme", "panel", "daemon", "architecture", "requirements", "stack", "node", "vite", "mysql", "docker", "react", "fastify"],
    sourcePath: "README.md",
    relatedSlugs: ["install-panel", "architecture", "panel-guide", "api-documentation", "api-surface-map"],
    sections: [
      {
        title: "What Guartrix is",
        paragraphs: [
          "Guartrix is a self-hosted panel and daemon stack for Minecraft hosting across one or more nodes.",
          "The panel provides the web UI and API, while daemons on nodes run Docker-backed game servers, SFTP, and optional node-local MySQL services.",
        ],
      },
      {
        title: "Supported server families",
        bullets: [
          "Vanilla",
          "Paper",
          "Purpur",
          "Fabric",
          "Quilt",
          "Forge",
          "NeoForge",
        ],
      },
      {
        title: "Tech stack",
        paragraphs: [
          "Guartrix is a Node.js 22+ / TypeScript monorepo. The web UI is React 19 built with Vite; the API is Fastify with Prisma on MySQL; each node runs a Fastify daemon that drives Docker game containers, SFTP, and optional node-local MySQL.",
        ],
        bullets: [
          "Runtime: Node.js 22+, TypeScript",
          "Web: React 19, Vite 6, React Router, Bootstrap 5",
          "API: Fastify 5, Prisma → panel MySQL",
          "Daemon / nodes: Docker Engine, SFTP (ssh2), node MySQL for game DBs",
          "Optional: Redis (HA), SMTP, Mollie, Sentry, Prometheus metrics",
          "Production: prod-web serves the Vite build and proxies /api and /ws",
        ],
      },
      {
        title: "Notable product features",
        bullets: [
          "Geyser one-click + Velocity/Bungee backend helpers (proxy not hosted by Guartrix)",
          "BlueMap / World Map, world reset & zip upload, resource packs",
          "Per-server MySQL databases, schedules, node transfer",
          "Client API (`gt_`) and Application API / Mollie (`gta_`)",
          "Free tier without license: 1 node, 1 server, 10 GB disk",
        ],
      },
      {
        title: "Main documentation areas",
        bullets: [
          "Install and node setup",
          "Accounts, quotas, and security",
          "Server management, files, backups, and networking",
          "Client API, Application API, billing, and licensing",
          "Operations, scaling, and internal architecture",
        ],
      },
    ],
  },
  {
    slug: "architecture",
    title: "Architecture",
    summary:
      "Tech stack, monorepo layout, panel ↔ daemon flow, MySQL/Redis/Sentry notes, and trust boundaries.",
    category: "Overview",
    keywords: ["architecture", "stack", "vite", "fastify", "prisma", "docker", "redis", "sentry"],
    sourcePath: "docs/wiki/architecture.md",
    relatedSlugs: ["overview", "env-reference", "daemon-api", "scaling"],
    sections: [
      {
        title: "Stack",
        bullets: [
          "Node.js 22+ / TypeScript monorepo",
          "Web: React 19, Vite 6, Bootstrap",
          "API: Fastify 5, Prisma → MySQL",
          "Daemon: Fastify + node-agent (Docker, SFTP, game MySQL)",
          "Optional Redis, SMTP, Mollie, Sentry (API/daemon + VITE_SENTRY_DSN for browser), Prometheus metrics",
        ],
      },
      {
        title: "Request path",
        paragraphs: [
          "Browsers hit prod-web (:80/:443), which serves the Vite build and proxies `/api` and `/ws` to the API on localhost :3001.",
          "The API talks to daemons with short-lived HS256 JWTs. Game servers run as Docker containers on each node.",
        ],
      },
      {
        title: "MySQL layout",
        paragraphs: [
          "On a full Docker install, panel and game databases often share one `guartrix-mysql` container/volume — recreate carefully.",
          "Remote nodes run their own game MySQL. Local daemon env is under `data/daemon.env`; remote daemon-only uses `/var/lib/guartrix/daemon.env`.",
        ],
      },
    ],
  },
  {
    slug: "api-documentation",
    title: "API documentation",
    summary:
      "HTTP API docs live in a dedicated API Reference at /api-docs — explorer, examples, Client and Application APIs.",
    category: "Overview",
    keywords: ["api", "rest", "gt_", "gta_", "openapi", "explorer", "client", "application", "billing"],
    sourcePath: "docs/wiki/api-docs-ui.md",
    relatedSlugs: ["overview", "security", "accounts-quotas"],
    sections: [
      {
        title: "Open the API Reference",
        paragraphs: [
          "API documentation is no longer part of this wiki sidebar. Use the dedicated API docs product for overview, conventions, Client API, Application API, examples, and the interactive explorer.",
        ],
        bullets: [
          "Panel path: /api-docs",
          "Interactive Try it: /api-docs/explorer",
          "Old /wiki/api-* URLs redirect automatically.",
        ],
        code: [
          {
            label: "Links",
            language: "text",
            content: "/api-docs\n/api-docs/explorer\n/api-docs/client\n/api-docs/application",
          },
        ],
      },
    ],
  },
];
