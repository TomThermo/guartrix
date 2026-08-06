import { Link, Navigate, useParams } from "react-router-dom";
import { Card } from "react-bootstrap";
import { ApiDocsLayout } from "../components/api-docs/ApiDocsLayout";
import { ApiExplorer } from "../components/api-docs/ApiExplorer";
import { WikiMarkdown } from "../components/wiki/WikiMarkdown";
import {
  apiDocsBySlug,
  apiDocsHref,
  apiDocsHome,
} from "../api-docs/api-docs-content";

export function ApiDocsPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/api-docs" replace />;

  // /api-docs/overview → home
  if (slug === "overview" || slug === apiDocsHome.slug) {
    return <Navigate to="/api-docs" replace />;
  }

  const page = apiDocsBySlug.get(slug);
  if (!page) return <Navigate to="/api-docs" replace />;

  const related = (page.relatedSlugs ?? [])
    .map((s) => apiDocsBySlug.get(s))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const sourceUrl = page.sourcePath
    ? `https://github.com/TomThermo/guartrix/blob/main/${page.sourcePath}`
    : null;

  return (
    <ApiDocsLayout title={page.title} subtitle={page.summary} activeSlug={page.slug}>
      <div className="api-docs-topbar">
        <Link to="/api-docs" className="api-docs-backlink">
          <i className="fa-solid fa-arrow-left me-2" />
          API overview
        </Link>
        {page.sourcePath && sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-secondary small text-decoration-none"
          >
            Source: {page.sourcePath}
          </a>
        )}
      </div>

      <Card
        className={`api-docs-article-body${page.interactive ? " api-docs-article-body--interactive" : ""}`}
      >
        <Card.Body>
          {page.interactive === "api-explorer" ? (
            <ApiExplorer />
          ) : page.markdown?.trim() ? (
            <WikiMarkdown text={page.markdown} />
          ) : (
            <p className="text-secondary mb-0">No content for this page yet.</p>
          )}

          {related.length > 0 && (
            <section className="wiki-article-section mt-4">
              <h2>Related</h2>
              <ul className="wiki-related-inline">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link to={apiDocsHref(item.slug)}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Card.Body>
      </Card>
    </ApiDocsLayout>
  );
}
