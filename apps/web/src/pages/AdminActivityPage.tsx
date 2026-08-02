import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Card } from "react-bootstrap";
import { ActivityPanel } from "../components/ActivityPanel";

export function AdminActivityPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">
            <i className="fa-solid fa-list-check me-2 text-primary" />
            Activity
          </h1>
          <p className="text-secondary mb-0">
            Every recorded action across all servers, accounts and nodes.
          </p>
        </div>
        <Link to="/" className="btn btn-sm btn-outline-secondary">
          Back
        </Link>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <ActivityPanel showServer onError={setError} />
        </Card.Body>
      </Card>
    </>
  );
}
