import { Alert, Button, Modal, Spinner } from "react-bootstrap";

interface Props {
  serverName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function KillServerModal({
  serverName,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Modal show onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title className="text-warning">
          <i className="fa-solid fa-skull-crossbones me-2" />
          Force-kill server
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="warning" className="mb-3">
          <strong>This is dangerous.</strong>
          <div className="mt-2 small mb-0">
            Kill immediately stops{" "}
            <strong>{serverName}</strong> without a graceful Minecraft shutdown.
            Open worlds may not be saved cleanly, which can cause{" "}
            <strong>world corruption</strong>, lost player data, or broken chunk
            files.
          </div>
        </Alert>
        <p className="text-secondary small mb-0">
          Prefer <strong>Stop</strong> whenever possible. Use Kill only if the
          server is frozen or Stop does not respond.
        </p>
      </Modal.Body>
      <Modal.Footer className="flex-wrap gap-2">
        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="warning" disabled={busy} onClick={onConfirm}>
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <>
              <i className="fa-solid fa-skull-crossbones me-1" />
              Kill anyway
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
