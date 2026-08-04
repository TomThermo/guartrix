import { Link } from "react-router-dom";
import { Badge, Card } from "react-bootstrap";
import type { WikiArticle } from "../../wiki/wiki-types";

export function WikiArticleCard({ article }: { article: WikiArticle }) {
  return (
    <Card className="wiki-article-card h-100">
      <Card.Body className="d-flex flex-column gap-3">
        <div className="d-flex align-items-start justify-content-between gap-3">
          <div>
            <Badge bg="secondary" className="wiki-category-badge mb-2">
              {article.category}
            </Badge>
            <Card.Title as="h2" className="h5 mb-2">
              {article.title}
            </Card.Title>
            <Card.Text className="text-secondary mb-0">{article.summary}</Card.Text>
          </div>
          <i className="fa-solid fa-book-open wiki-article-icon" />
        </div>
        <div className="wiki-keywords">
          {article.keywords.slice(0, 4).map((keyword) => (
            <span key={keyword} className="wiki-keyword-pill">
              {keyword}
            </span>
          ))}
        </div>
        <div className="mt-auto">
          <Link to={`/wiki/${article.slug}`} className="btn btn-sm btn-outline-secondary">
            Open article
          </Link>
        </div>
      </Card.Body>
    </Card>
  );
}
