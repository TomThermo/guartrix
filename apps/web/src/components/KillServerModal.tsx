import { Alert, Button, Modal, Spinner } from "react-bootstrap";
import { useI18n } from "../i18n/react";

interface Props {
  serverName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function KillServerModal({ serverName, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useI18n();

  return (
    <Modal show onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title className="text-warning">
          <i className="fa-solid fa-skull-crossbones me-2" />
          {t("modals.killTitle")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="warning" className="mb-3">
          <strong>{t("modals.killDanger")}</strong>
          <div className="mt-2 small mb-0">{t("modals.killBody", { name: serverName })}</div>
        </Alert>
        <p className="text-secondary small mb-0">{t("modals.killPreferStop")}</p>
      </Modal.Body>
      <Modal.Footer className="flex-wrap gap-2">
        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="warning" disabled={busy} onClick={onConfirm}>
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <>
              <i className="fa-solid fa-skull-crossbones me-1" />
              {t("modals.killConfirm")}
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
