import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "react-bootstrap";
import { WikiLayout } from "../components/wiki/WikiLayout";
import { WikiSearchBox } from "../components/wiki/WikiSearchBox";
import { searchWikiArticles, wikiArticles, wikiCategories } from "../wiki/wiki-content";

export function WikiHomePage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => searchWikiArticles(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <WikiLayout
      title="Guartrix wiki"
      subtitle="Setup guides, server workflows, security notes, and API references."
    >
      <div className="wiki-search-panel mb-4">
        <WikiSearchBox value={query} onChange={setQuery} />
        {searching && (
          <p className="wiki-search-count mt-2 mb-0">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {searching ? (
        filtered.length === 0 ? (
          <Card className="wiki-empty-state">
            <Card.Body>
              <h2 className="h5 mb-2">No matches yet</h2>
              <p className="text-secondary mb-0">
                Try broader words like <code>install</code>, <code>nodes</code>,{" "}
                <code>security</code>, <code>files</code>, or <code>API</code>.
              </p>
            </Card.Body>
          </Card>
        ) : (
          <ul className="wiki-result-list">
            {filtered.map((article) => (
              <li key={article.slug}>
                <Link to={`/wiki/${article.slug}`} className="wiki-result-link">
                  <span className="wiki-result-category">{article.category}</span>
                  <strong>{article.title}</strong>
                  <span className="wiki-result-summary">{article.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="wiki-overview">
          {wikiCategories.map((category) => {
            const articles = wikiArticles.filter((article) => article.category === category);
            return (
              <section key={category} className="wiki-overview-section">
                <h2 className="wiki-overview-title">{category}</h2>
                <ul className="wiki-overview-list">
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <Link to={`/wiki/${article.slug}`} className="wiki-overview-link">
                        <strong>{article.title}</strong>
                        <span>{article.summary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </WikiLayout>
  );
}
