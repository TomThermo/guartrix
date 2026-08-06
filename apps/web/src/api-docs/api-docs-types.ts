export type ApiDocsSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type ApiDocsPage = {
  slug: string;
  title: string;
  summary: string;
  group: string;
  keywords: string[];
  sourcePath?: string;
  relatedSlugs?: string[];
  markdown?: string;
  interactive?: "api-explorer";
  /** When true, this page is the `/api-docs` index (no slug in URL). */
  isHome?: boolean;
  sections?: ApiDocsSection[];
};
