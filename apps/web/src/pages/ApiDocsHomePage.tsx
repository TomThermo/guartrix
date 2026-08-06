import { Link } from "react-router-dom";
import { Card } from "react-bootstrap";
import { ApiDocsHomeSections } from "../components/api-docs/ApiDocsHomeSections";
import { ApiDocsLayout } from "../components/api-docs/ApiDocsLayout";
import { WikiMarkdown } from "../components/wiki/WikiMarkdown";
import {
  apiDocsBySlug,
  apiDocsHome,
  apiDocsHref,
} from "../api-docs/api-docs-content";

export function ApiDocsHomePage() {
  const home = apiDocsHome;
  const related = (home.relatedSlugs ?? [])
    .map((s) => apiDocsBySlug.get(s))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const sourceUrl = home.sourcePath
    ? `https://github.com/TomThermo/guartrix/blob/main/${home.sourcePath}`
    : null;

  return (
    <ApiDocsLayout title={home.title} subtitle={home.summary} activeSlug={home.slug}>
      <div className="api-docs-topbar">
        <span className="text-secondary small">Guartrix HTTP API</span>
        {home.sourcePath && sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-secondary small text-decoration-none"
          >
            Source: {home.sourcePath}
          </a>
        )}
      </div>

      <Card className="api-docs-article-body">
        <Card.Body>
          <p className="docs-home-intro">
            Guartrix exposes a <strong>Fastify JSON API</strong> on the same origin as the panel
            (<code>https://your-panel/api/…</code>). The web UI proxies <code>/api</code> and{" "}
            <code>/ws</code> to the API process (default <code>127.0.0.1:3001</code>).
          </p>

          <ApiDocsHomeSections />

          {home.markdown?.trim() ? <WikiMarkdown text={home.markdown} /> : null}

          <section className="docs-home-section mt-4">
            <h2 className="docs-home-section-title">More in this reference</h2>
            <div className="docs-card-grid docs-card-grid--compact">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  to={apiDocsHref(item.slug)}
                  className="docs-card docs-card--link"
                >
                  <div className="docs-card-title-row">
                    <span className="docs-card-title">{item.title}</span>
                    {item.interactive ? (
                      <span className="docs-card-path">Try it</span>
                    ) : null}
                  </div>
                  <p className="docs-card-desc">{item.summary}</p>
                  <span className="docs-card-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </Card.Body>
      </Card>
    </ApiDocsLayout>
  );
}
