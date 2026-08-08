import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, Modal, Spinner } from "react-bootstrap";
import { useI18n } from "../i18n/react";

export type ConfirmVariant = "danger" | "primary" | "warning";

interface Props {
  show: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional middle action (e.g. "Restore only"). */
  secondaryLabel?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  onConfirm: () => void;
  onSecondary?: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  show,
  title,
  body,
  confirmLabel,
  cancelLabel,
  secondaryLabel,
  variant = "primary",
  busy = false,
  onConfirm,
  onSecondary,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const resolvedConfirm = confirmLabel ?? t("modals.confirm");
  const resolvedCancel = cancelLabel ?? t("common.cancel");
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!show || busy) return;
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [show, busy]);

  return (
    <Modal
      show={show}
      onHide={busy ? undefined : onCancel}
      centered
      backdrop="static"
      role="dialog"
      aria-labelledby={titleId}
    >
      <Modal.Header closeButton={!busy}>
        <Modal.Title id={titleId}>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{typeof body === "string" ? <p className="mb-0">{body}</p> : body}</Modal.Body>
      <Modal.Footer className="flex-wrap gap-2">
        <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
          {resolvedCancel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="outline-primary" disabled={busy} onClick={onSecondary}>
            {busy ? <Spinner size="sm" /> : secondaryLabel}
          </Button>
        )}
        <Button ref={confirmRef} variant={variant} disabled={busy} onClick={onConfirm}>
          {busy ? <Spinner size="sm" /> : resolvedConfirm}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
