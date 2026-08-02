import { useState, type FormEvent } from "react";
import type { McServer } from "@msm/shared";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { api } from "../api";

interface Props {
  server: McServer;
  busy?: boolean;
  onCancel: () => void;
  onDone: (server: McServer) => void;
}

export function ReinstallServerModal({
  server,
  busy = false,
  onCancel,
  onDone,
}: Props) {
  const [keepWorld, setKeepWorld] = useState(true);
  const [keepAddons, setKeepAddons] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (confirm.trim().toLowerCase() !== "reinstall") {
      setError('Type "reinstall" to confirm.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const { server: next } = await api.reinstallServer(server.id, {
        keepWorld,
        keepAddons,
      });
      onDone(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reinstall failed");
      setRunning(false);
    }
  }

  const locked = busy || running;

  return (
    <Modal show onHide={locked ? undefined : onCancel} centered backdrop="static">
      <Form onSubmit={(e) => void onSubmit(e)}>
        <Modal.Header closeButton={!locked}>
          <Modal.Title>
            <i className="fa-solid fa-rotate me-2" />
            Reinstall server
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary small">
            Reinstalls the <strong>{server.type}</strong> runtime for{" "}
            <strong>{server.name}</strong> ({server.mcVersion}). A backup is
            created automatically. The server must be stopped.
          </p>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
            </Alert>
          )}
          <Form.Check
            type="switch"
            id="reinstall-keep-world"
            className="mb-2"
            label="Keep world"
            checked={keepWorld}
            disabled={locked}
            onChange={(e) => setKeepWorld(e.target.checked)}
          />
          <Form.Check
            type="switch"
            id="reinstall-keep-addons"
            className="mb-3"
            label="Keep plugins / mods"
            checked={keepAddons}
            disabled={locked}
            onChange={(e) => setKeepAddons(e.target.checked)}
          />
          {!keepWorld && (
            <Alert variant="warning" className="py-2 small">
              World folders will be wiped. A fresh world generates on next start.
            </Alert>
          )}
          <Form.Group controlId="reinstall-confirm">
            <Form.Label>
              Type <code>reinstall</code> to confirm
            </Form.Label>
            <Form.Control
              value={confirm}
              disabled={locked}
              autoFocus
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={locked} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" disabled={locked}>
            {running ? <Spinner size="sm" /> : "Reinstall"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
