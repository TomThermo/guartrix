import { Link, Navigate, useParams } from "react-router-dom";
import { Card } from "react-bootstrap";
import { WikiLayout } from "../components/wiki/WikiLayout";
import { WikiMarkdown } from "../components/wiki/WikiMarkdown";
import { wikiArticlesBySlug } from "../wiki/wiki-content";
import { WIKI_API_REDIRECTS } from "../api-docs/api-docs-content";

export function WikiArticlePage() {
  const { slug } = useParams<{ slug: string }>();

  if (slug && WIKI_API_REDIRECTS[slug]) {
    return <Navigate to={WIKI_API_REDIRECTS[slug]} replace />;
  }

  const article = slug ? wikiArticlesBySlug.get(slug) : undefined;

  if (!article) return <Navigate to="/wiki" replace />;

  const related = (article.relatedSlugs ?? [])
    .map((relatedSlug) => wikiArticlesBySlug.get(relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const sourceUrl = article.sourcePath
    ? `https://github.com/TomThermo/guartrix/blob/main/${article.sourcePath}`
    : null;
  const useMarkdown = Boolean(article.markdown?.trim());

  return (
    <WikiLayout
      title={article.title}
      subtitle={article.summary}
      kicker={article.category}
      activeSlug={article.slug}
    >
      <div className="wiki-article-topbar">
        <Link to="/wiki" className="wiki-backlink">
          <i className="fa-solid fa-arrow-left me-2" />
          Overview
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

      <Card className="wiki-article-body">
        <Card.Body>
          {useMarkdown ? (
            <WikiMarkdown text={article.markdown!} />
          ) : (
            article.sections.map((section) => (
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
                  <div
                    key={`${section.title}-${block.label ?? block.content}`}
                    className="wiki-code-block"
                  >
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
                        <img
                          src={image.src}
                          alt={image.alt}
                          className="wiki-image"
                          loading="lazy"
                        />
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
            ))
          )}

          {related.length > 0 && (
            <section className="wiki-article-section">
              <h2>Related articles</h2>
              <ul className="wiki-related-inline">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link to={`/wiki/${item.slug}`}>{item.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Card.Body>
      </Card>
    </WikiLayout>
  );
}
