import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import { useI18n } from "../i18n/react";

interface Props {
  show: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptModal({
  show,
  title,
  label,
  defaultValue = "",
  placeholder,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const resolvedConfirm = confirmLabel ?? t("common.confirm");
  const resolvedCancel = cancelLabel ?? t("common.cancel");
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!show) return;
    setValue(defaultValue);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [show, defaultValue]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onConfirm(value);
  }

  return (
    <Modal
      show={show}
      onHide={busy ? undefined : onCancel}
      centered
      backdrop="static"
      role="dialog"
      aria-labelledby={titleId}
    >
      <Form onSubmit={onSubmit}>
        <Modal.Header closeButton={!busy}>
          <Modal.Title id={titleId}>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId={inputId}>
            <Form.Label>{label}</Form.Label>
            <Form.Control
              ref={inputRef}
              type="text"
              value={value}
              placeholder={placeholder}
              disabled={busy}
              onChange={(e) => setValue(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={busy} onClick={onCancel}>
            {resolvedCancel}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner size="sm" /> : resolvedConfirm}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
