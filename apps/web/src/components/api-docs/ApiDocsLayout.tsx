import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Badge, Container } from "react-bootstrap";
import { ApiDocsSidebar } from "./ApiDocsSidebar";

export function ApiDocsLayout({
  title,
  subtitle,
  activeSlug,
  children,
}: {
  title: string;
  subtitle: string;
  activeSlug?: string;
  children: ReactNode;
}) {
  return (
    <Container fluid className="py-4 py-lg-5 api-docs-page">
      <div className="api-docs-shell">
        <ApiDocsSidebar activeSlug={activeSlug} />
        <div className="api-docs-main">
          <div className="api-docs-hero">
            <div className="api-docs-hero-copy">
              <Badge bg="primary-subtle" text="primary" className="api-docs-kicker">
                API Reference
              </Badge>
              <h1 className="api-docs-title">{title}</h1>
              <p className="api-docs-subtitle">{subtitle}</p>
            </div>
            <div className="api-docs-hero-actions">
              <Link to="/api-docs/explorer" className="btn btn-success">
                <i className="fa-solid fa-play me-1" />
                Explorer
              </Link>
              <Link to="/wiki" className="btn btn-outline-secondary">
                <i className="fa-solid fa-book-open me-1" />
                Wiki
              </Link>
              <Link to="/login" className="btn btn-outline-secondary">
                <i className="fa-solid fa-right-to-bracket me-1" />
                Panel login
              </Link>
            </div>
          </div>
          {children}
        </div>
      </div>
    </Container>
  );
}
