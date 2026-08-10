/**
 * Wiki bodies from docs/wiki (and README) embedded at Vite build time via ?raw.
 * Metadata (slug, title, summary, …) stays in articles/*.ts.
 */
const rawByImportPath = import.meta.glob(
  ["../../../../docs/wiki/**/*.md", "../../../../README.md"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function importPathForSource(sourcePath: string): string {
  if (sourcePath === "README.md") return "../../../../README.md";
  return `../../../../${sourcePath}`;
}

/** Markdown body for a wiki article sourcePath, when the file exists in the repo. */
export function wikiMarkdownForSource(sourcePath?: string): string | undefined {
  if (!sourcePath?.trim()) return undefined;
  const key = importPathForSource(sourcePath.trim());
  const body = rawByImportPath[key];
  return typeof body === "string" && body.trim() ? body : undefined;
}
