/**
 * Full markdown bodies for /api-docs pages.
 * Source of truth: docs/wiki/api-*.md — Vite embeds at build time via ?raw.
 */
import apiOverviewMd from "../../../../docs/wiki/api-overview.md?raw";
import apiExamplesMd from "../../../../docs/wiki/api-examples.md?raw";
import apiConventionsMd from "../../../../docs/wiki/api-conventions.md?raw";
import clientApiMd from "../../../../docs/wiki/client-api.md?raw";
import applicationApiMd from "../../../../docs/wiki/application-api.md?raw";
import apiExplorerMd from "../../../../docs/wiki/api-explorer.md?raw";

export const API_DOCS_MARKDOWN = {
  overview: apiOverviewMd,
  examples: apiExamplesMd,
  conventions: apiConventionsMd,
  client: clientApiMd,
  application: applicationApiMd,
  explorer: apiExplorerMd,
} as const;

export type ApiDocsMarkdownSlug = keyof typeof API_DOCS_MARKDOWN;
