import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Badge, Container } from "react-bootstrap";

export function WikiLayout({
  title,
  subtitle,
  kicker = "Public Wiki",
  children,
}: {
  title: string;
  subtitle: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <Container className="py-4 py-lg-5 wiki-page">
      <div className="wiki-hero">
        <div className="wiki-hero-copy">
          <Badge bg="success-subtle" text="success" className="wiki-kicker">
            {kicker}
          </Badge>
          <h1 className="wiki-title">{title}</h1>
          <p className="wiki-subtitle">{subtitle}</p>
        </div>
        <div className="wiki-hero-actions">
          <Link to="/wiki" className="btn btn-primary">
            Browse wiki
          </Link>
          <Link to="/login" className="btn btn-outline-secondary">
            Panel login
          </Link>
        </div>
      </div>
      {children}
    </Container>
  );
}
