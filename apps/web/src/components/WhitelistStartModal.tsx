import { Button, Modal, Spinner } from "react-bootstrap";

interface Props {
  serverName: string;
  busy?: boolean;
  onCancel: () => void;
  onStartAnyway: () => void;
  onEnableAndStart: () => void;
}

export function WhitelistStartModal({
  serverName,
  busy = false,
  onCancel,
  onStartAnyway,
  onEnableAndStart,
}: Props) {
  return (
    <Modal show onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title>
          <i className="fa-solid fa-triangle-exclamation text-warning me-2" />
          Whitelist is off
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          You are about to start <strong>{serverName}</strong> with the whitelist{" "}
          <strong>disabled</strong>.
        </p>
        <p className="text-secondary small mb-2">
          Without a whitelist, <strong>anyone</strong> who knows your IP and port can join — griefers
          can destroy the world, steal items, or spam commands if they get OP somehow. On an open
          internet connection this is risky.
        </p>
        <p className="text-secondary small mb-0">
          Recommended: enable the whitelist and add trusted players under Whitelist Manager before
          going public.
        </p>
      </Modal.Body>
      <Modal.Footer className="flex-wrap gap-2">
        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline-warning" disabled={busy} onClick={onStartAnyway}>
          {busy ? <Spinner size="sm" /> : "Start anyway"}
        </Button>
        <Button variant="primary" disabled={busy} onClick={onEnableAndStart}>
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <>
              <i className="fa-solid fa-shield-halved me-1" />
              Enable whitelist &amp; start
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
