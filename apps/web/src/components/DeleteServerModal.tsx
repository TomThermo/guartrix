import { useState, type FormEvent } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";

interface Props {
  serverId: string;
  serverName: string;
  onCancel: () => void;
  onDeleted: () => void;
}

export function DeleteServerModal({
  serverId,
  serverName,
  onCancel,
  onDeleted,
}: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Enter your account password to confirm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteServer(serverId, password);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <Modal show onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Form onSubmit={(e) => void onSubmit(e)}>
        <Modal.Header closeButton={!busy}>
          <Modal.Title className="text-danger">
            <i className="fa-solid fa-triangle-exclamation me-2" />
            Delete server
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger" className="mb-3">
            <strong>This cannot be undone.</strong>
            <div className="mt-2 small mb-0">
              Deleting <strong>{serverName}</strong> permanently removes the world,
              files, databases, and backups for this server. It will no longer appear
              in your panel.
            </div>
          </Alert>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Group controlId="delete-server-password">
            <Form.Label>Confirm with your password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              autoFocus
              placeholder="Account password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Form.Text muted>
              Enter the password for your Guartrix account to verify this action.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !password.trim()}>
            {busy ? (
              <>
                <Spinner size="sm" className="me-2" />
                Deleting…
              </>
            ) : (
              <>
                <i className="fa-solid fa-trash me-1" />
                Delete permanently
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
