import type { WikiArticle } from "../wiki-types";

export const overviewArticles: WikiArticle[] = [
  {
    slug: "overview",
    title: "Guartrix overview",
    summary:
      "A high-level introduction to the panel, daemon, supported server types, architecture, requirements, and documentation entry points.",
    category: "Overview",
    keywords: [
      "overview",
      "readme",
      "panel",
      "daemon",
      "architecture",
      "requirements",
      "stack",
      "node",
      "vite",
      "mysql",
      "docker",
      "react",
      "fastify",
    ],
    sourcePath: "README.md",
    relatedSlugs: [
      "install-panel",
      "architecture",
      "panel-guide",
      "api-documentation",
      "api-surface-map",
    ],
    sections: [],
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
    sections: [],
  },
  {
    slug: "api-documentation",
    title: "API documentation",
    summary:
      "HTTP API docs live in a dedicated API Reference at /api-docs — explorer, examples, Client and Application APIs.",
    category: "Overview",
    keywords: [
      "api",
      "rest",
      "gt_",
      "gta_",
      "openapi",
      "explorer",
      "client",
      "application",
      "billing",
    ],
    sourcePath: "docs/wiki/api-docs-ui.md",
    relatedSlugs: ["overview", "security", "accounts-quotas"],
    sections: [],
  },
];
