import { Link, Navigate, useParams } from "react-router-dom";
import { Card, ListGroup } from "react-bootstrap";
import { WikiLayout } from "../components/wiki/WikiLayout";
import { wikiArticlesBySlug } from "../wiki/wiki-content";

export function WikiArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? wikiArticlesBySlug.get(slug) : undefined;

  if (!article) return <Navigate to="/wiki" replace />;

  const related = (article.relatedSlugs ?? [])
    .map((relatedSlug) => wikiArticlesBySlug.get(relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const sourceUrl = article.sourcePath
    ? `https://github.com/TomThermo/guartrix/blob/main/${article.sourcePath}`
    : null;

  return (
    <WikiLayout title={article.title} subtitle={article.summary} kicker={article.category}>
      <div className="wiki-article-topbar">
        <Link to="/wiki" className="wiki-backlink">
          <i className="fa-solid fa-arrow-left me-2" />
          Back to wiki
        </Link>
        {article.sourcePath && sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-secondary small text-decoration-none"
          >
            Source: {article.sourcePath}
          </a>
        )}
      </div>

      <div className="wiki-article-grid">
        <Card className="wiki-article-body">
          <Card.Body>
            {article.sections.map((section) => (
              <section key={section.title} className="wiki-article-section">
                <h2>{section.title}</h2>
                {(section.paragraphs ?? []).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.code?.map((block) => (
                  <div key={`${section.title}-${block.label ?? block.content}`} className="wiki-code-block">
                    {block.label && (
                      <div className="wiki-code-label">
                        {block.label}
                        {block.language ? ` · ${block.language}` : ""}
                      </div>
                    )}
                    <pre>
                      <code>{block.content}</code>
                    </pre>
                  </div>
                ))}
                {section.images && (
                  <div className="wiki-image-grid">
                    {section.images.map((image) => (
                      <figure key={`${section.title}-${image.src}`} className="wiki-image-card">
                        <img src={image.src} alt={image.alt} className="wiki-image" loading="lazy" />
                        {(image.caption || image.alt) && (
                          <figcaption className="wiki-image-caption">
                            {image.caption ?? image.alt}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </Card.Body>
        </Card>

        <Card className="wiki-article-sidebar">
          <Card.Body>
            <h2 className="h6 text-uppercase text-secondary mb-3">Related articles</h2>
            <ListGroup variant="flush">
              {related.map((item) => (
                <ListGroup.Item key={item.slug} className="px-0">
                  <Link to={`/wiki/${item.slug}`} className="wiki-related-link">
                    <strong>{item.title}</strong>
                    <span>{item.summary}</span>
                  </Link>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card.Body>
        </Card>
      </div>
    </WikiLayout>
  );
}
