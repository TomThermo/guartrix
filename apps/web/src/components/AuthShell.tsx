import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Card, Col, Container, Row } from "react-bootstrap";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container className="min-vh-100 d-flex align-items-center py-4">
      <Row className="justify-content-center w-100">
        <Col xs={12} md={7} lg={5} xl={4}>
          <Card className="shadow-sm border-0">
            <Card.Body className="p-3 p-sm-4">
              <div className="d-flex align-items-center gap-2 mb-3">
                <Link to="/login" className="brand-mark text-decoration-none">
                  <i className="fa-solid fa-server" />
                </Link>
                <div>
                  <h1 className="h4 mb-0">{title}</h1>
                  {subtitle && (
                    <div className="text-secondary small">{subtitle}</div>
                  )}
                </div>
              </div>
              {children}
              {footer && <div className="mt-3 small text-secondary">{footer}</div>}
            </Card.Body>
          </Card>
          <div className="text-center mt-3 small text-secondary">
            <Link to="/terms" className="link-secondary">
              Terms
            </Link>
            <span className="mx-2">·</span>
            <Link to="/privacy" className="link-secondary">
              Privacy
            </Link>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
