import type { ApiDocsPage } from "./api-docs-types";
import { API_DOCS_MARKDOWN } from "./api-docs-md";

/** Legacy wiki slugs → new /api-docs paths (without leading slash). */
export const WIKI_API_REDIRECTS: Record<string, string> = {
  "api-overview": "/api-docs",
  "api-explorer": "/api-docs/explorer",
  "api-examples": "/api-docs/examples",
  "api-conventions": "/api-docs/conventions",
  "client-api": "/api-docs/client",
  "application-billing": "/api-docs/application",
};

const pages: ApiDocsPage[] = [
  {
    slug: "overview",
    title: "API overview",
    summary:
      "Map of Guartrix HTTP APIs: Client (gt_), Application (gta_), session auth, and where to start.",
    group: "Start",
    keywords: ["api", "overview", "rest", "http", "gt_", "gta_", "bearer", "openapi"],
    sourcePath: "docs/wiki/api-overview.md",
    relatedSlugs: ["explorer", "examples", "conventions", "client", "application"],
    isHome: true,
    markdown: API_DOCS_MARKDOWN.overview,
  },
  {
    slug: "explorer",
    title: "API explorer",
    summary:
      "Interactive playground: pick an endpoint, switch language (cURL, Node, Python, PHP, Ruby, Java, Go), and run Try it against this panel.",
    group: "Start",
    keywords: [
      "api",
      "explorer",
      "playground",
      "try it",
      "curl",
      "php",
      "python",
      "ruby",
      "java",
      "javascript",
      "go",
    ],
    sourcePath: "docs/wiki/api-explorer.md",
    relatedSlugs: ["overview", "examples", "conventions", "client", "application"],
    interactive: "api-explorer",
    markdown: API_DOCS_MARKDOWN.explorer,
  },
  {
    slug: "examples",
    title: "API examples",
    summary:
      "Worked examples: curl commands, request bodies, and sample JSON responses for account, servers, files, backups, and Application API.",
    group: "Reference",
    keywords: ["api", "examples", "curl", "json", "response", "request", "gt_", "gta_"],
    sourcePath: "docs/wiki/api-examples.md",
    relatedSlugs: ["explorer", "overview", "conventions", "client", "application"],
    markdown: API_DOCS_MARKDOWN.examples,
  },
  {
    slug: "conventions",
    title: "API conventions",
    summary:
      "Shared HTTP rules: auth headers, error JSON, status codes, rate limits, IDs, and pagination.",
    group: "Reference",
    keywords: ["api", "conventions", "errors", "401", "403", "429", "csrf", "bearer"],
    sourcePath: "docs/wiki/api-conventions.md",
    relatedSlugs: ["overview", "examples", "client"],
    markdown: API_DOCS_MARKDOWN.conventions,
  },
  {
    slug: "client",
    title: "Client API",
    summary:
      "Personal gt_ API keys: permissions, endpoint index, admin scopes, and automation patterns.",
    group: "APIs",
    keywords: ["api", "client api", "gt_", "bearer", "automation", "permissions"],
    sourcePath: "docs/wiki/client-api.md",
    relatedSlugs: ["examples", "overview", "application", "explorer"],
    markdown: API_DOCS_MARKDOWN.client,
  },
  {
    slug: "application",
    title: "Application API and billing",
    summary:
      "Machine gta_ keys for billing panels, provisioning, suspend, and Mollie checkout automation.",
    group: "APIs",
    keywords: ["application api", "billing", "mollie", "gta_", "plans", "payments", "suspend"],
    sourcePath: "docs/wiki/application-api.md",
    relatedSlugs: ["client", "overview", "explorer", "examples"],
    markdown: API_DOCS_MARKDOWN.application,
  },
];

export const apiDocsPages: ApiDocsPage[] = pages;

export const apiDocsBySlug = new Map(pages.map((p) => [p.slug, p]));

export const apiDocsHome = pages.find((p) => p.isHome)!;

export const apiDocsGroups = Array.from(new Set(pages.map((p) => p.group)));

function pageSearchText(page: ApiDocsPage): string {
  return [page.title, page.summary, page.group, page.keywords.join(" "), page.markdown ?? ""]
    .join(" ")
    .toLowerCase();
}

export function searchApiDocs(query: string): ApiDocsPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return apiDocsPages;
  return apiDocsPages.filter((page) => pageSearchText(page).includes(q));
}

export function apiDocsHref(slug: string): string {
  const page = apiDocsBySlug.get(slug);
  if (!page || page.isHome) return "/api-docs";
  return `/api-docs/${page.slug}`;
}
