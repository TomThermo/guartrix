import { useState, type FormEvent } from "react";
import type { McServer } from "@msm/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onCloned: (server: McServer) => void;
}

export function CloneServerModal({
  server,
  busy = false,
  onCancel,
  onCloned,
}: Props) {
  const [name, setName] = useState(`${server.name} copy`);
  const [port, setPort] = useState(String(Math.min(65535, server.port + 1)));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for the clone.");
      return;
    }
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
      setError("Port must be an integer between 1024 and 65535.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const cloned = await api.cloneServer(server.id, {
        name: trimmed,
        port: portNum,
      });
      onCloned(cloned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed");
      setRunning(false);
    }
  }

  const locked = busy || running;

  return (
    <Modal show onHide={locked ? undefined : onCancel} centered backdrop="static">
      <Form onSubmit={(e) => void onSubmit(e)}>
        <Modal.Header closeButton={!locked}>
          <Modal.Title>
            <i className="fa-solid fa-clone me-2" />
            Clone server
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary small">
            Copies files from <strong>{server.name}</strong> into a new server.
            The source must be stopped.
          </p>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Group className="mb-3" controlId="clone-name">
            <Form.Label>Name</Form.Label>
            <Form.Control
              value={name}
              disabled={locked}
              autoFocus
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
            />
          </Form.Group>
          <Form.Group controlId="clone-port">
            <Form.Label>Primary port</Form.Label>
            <Form.Control
              type="number"
              min={1024}
              max={65535}
              value={port}
              disabled={locked}
              onChange={(e) => setPort(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={locked} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={locked || !name.trim()}>
            {running ? (
              <>
                <Spinner size="sm" className="me-2" />
                Cloning…
              </>
            ) : (
              <>
                <i className="fa-solid fa-clone me-1" />
                Clone
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
