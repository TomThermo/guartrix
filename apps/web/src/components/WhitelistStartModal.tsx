import { Button, Modal, Spinner } from "react-bootstrap";
import { useI18n } from "../i18n/react";

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
  const { t } = useI18n();

  return (
    <Modal show onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title>
          <i className="fa-solid fa-triangle-exclamation text-warning me-2" />
          {t("modals.whitelistStartTitle")}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">{t("modals.whitelistStartBody", { name: serverName })}</p>
        <p className="text-secondary small mb-2">{t("modals.whitelistStartRisk")}</p>
        <p className="text-secondary small mb-0">{t("modals.whitelistStartRecommend")}</p>
      </Modal.Body>
      <Modal.Footer className="flex-wrap gap-2">
        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="outline-warning" disabled={busy} onClick={onStartAnyway}>
          {busy ? <Spinner size="sm" /> : t("modals.whitelistStartAnyway")}
        </Button>
        <Button variant="primary" disabled={busy} onClick={onEnableAndStart}>
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <>
              <i className="fa-solid fa-shield-halved me-1" />
              {t("modals.whitelistStartEnable")}
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
