import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Badge, Container } from "react-bootstrap";
import { WikiSidebar } from "./WikiSidebar";

export function WikiLayout({
  title,
  subtitle,
  kicker = "Public Wiki",
  activeSlug,
  children,
}: {
  title: string;
  subtitle: string;
  kicker?: string;
  activeSlug?: string;
  children: ReactNode;
}) {
  return (
    <Container fluid className="py-4 py-lg-5 wiki-page">
      <div className="wiki-shell">
        <WikiSidebar activeSlug={activeSlug} />
        <div className="wiki-main">
          <div className="wiki-hero">
            <div className="wiki-hero-copy">
              <Badge bg="success-subtle" text="success" className="wiki-kicker">
                {kicker}
              </Badge>
              <h1 className="wiki-title">{title}</h1>
              <p className="wiki-subtitle">{subtitle}</p>
            </div>
            <div className="wiki-hero-actions">
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
