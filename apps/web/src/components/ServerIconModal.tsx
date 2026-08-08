import { Modal } from "react-bootstrap";
import { useI18n } from "../i18n/react";
import { ServerIconField } from "./ServerIconField";

export function ServerIconModal({
  show,
  serverId,
  hasIcon,
  onHide,
  onChanged,
  onError,
  onNotice,
}: {
  show: boolean;
  serverId: string;
  hasIcon: boolean;
  onHide: () => void;
  onChanged: (hasIcon: boolean) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
}) {
  const { t } = useI18n();

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t("serverIcon.title")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ServerIconField
          serverId={serverId}
          hasIcon={hasIcon}
          onChanged={onChanged}
          onError={onError}
          onNotice={onNotice}
          bordered={false}
        />
      </Modal.Body>
    </Modal>
  );
}
