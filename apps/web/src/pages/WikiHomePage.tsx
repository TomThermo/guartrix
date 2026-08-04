import { useMemo, useState } from "react";
import { Badge, Button, Card, Col, Row } from "react-bootstrap";
import { WikiArticleCard } from "../components/wiki/WikiArticleCard";
import { WikiLayout } from "../components/wiki/WikiLayout";
import { WikiSearchBox } from "../components/wiki/WikiSearchBox";
import { searchWikiArticles, wikiArticles, wikiCategories } from "../wiki/wiki-content";

export function WikiHomePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(
    () => searchWikiArticles(query, category),
    [category, query],
  );

  const topArticles = useMemo(() => wikiArticles.slice(0, 4), []);

  return (
    <WikiLayout
      title="Guartrix wiki"
      subtitle="Search setup guides, server workflows, security notes, and API references from one public help hub."
    >
      <Card className="wiki-search-panel mb-4">
        <Card.Body>
          <div className="wiki-search-header">
            <div>
              <h2 className="h5 mb-1">Find documentation fast</h2>
              <p className="text-secondary mb-0">
                Search by topic, route, workflow, or operational area.
              </p>
            </div>
            <Badge bg="secondary">{filtered.length} results</Badge>
          </div>
          <div className="mt-3">
            <WikiSearchBox value={query} onChange={setQuery} />
          </div>
          <div className="wiki-filter-row mt-3">
            {["All", ...wikiCategories].map((item) => (
              <Button
                key={item}
                size="sm"
                variant={category === item ? "primary" : "outline-secondary"}
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </Card.Body>
      </Card>

      {!query && category === "All" && (
        <Card className="wiki-highlight-panel mb-4">
          <Card.Body>
            <h2 className="h5 mb-3">Popular starting points</h2>
            <Row className="g-3">
              {topArticles.map((article) => (
                <Col key={article.slug} md={6} xl={3}>
                  <WikiArticleCard article={article} />
                </Col>
              ))}
            </Row>
          </Card.Body>
        </Card>
      )}

      <Row className="g-3">
        {filtered.map((article) => (
          <Col key={article.slug} md={6} xl={4}>
            <WikiArticleCard article={article} />
          </Col>
        ))}
      </Row>

      {filtered.length === 0 && (
        <Card className="wiki-empty-state mt-4">
          <Card.Body>
            <h2 className="h5 mb-2">No matches yet</h2>
            <p className="text-secondary mb-0">
              Try broader words like <code>install</code>, <code>nodes</code>,{" "}
              <code>security</code>, <code>files</code>, or <code>API</code>.
            </p>
          </Card.Body>
        </Card>
      )}
    </WikiLayout>
  );
}
