import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button, Form, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

interface Props {
  path: string;
  content: string;
  dirty: boolean;
  busy: boolean;
  canUpdate: boolean;
  onChange: (content: string) => void;
  onClose: () => void;
  onSave: () => void;
  onAskDiscard: (then: () => void) => void;
}

export function FileEditorPane({
  path,
  content,
  dirty,
  busy,
  canUpdate,
  onChange,
  onClose,
  onSave,
  onAskDiscard,
}: Props) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [path]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (canUpdate && dirty && !busy) onSave();
      return;
    }
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${content.slice(0, start)}\t${content.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 1;
    });
  }

  return (
    <div className="file-editor-pane border rounded surface">
      <div className="file-editor-toolbar d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <strong className="font-monospace small text-break mb-0">{path}</strong>
        <Stack direction="horizontal" gap={2} className="flex-shrink-0">
          {dirty && (
            <span className="badge text-bg-warning">{t("files.unsaved")}</span>
          )}
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={busy}
            onClick={() => {
              if (dirty) {
                onAskDiscard(onClose);
                return;
              }
              onClose();
            }}
          >
            {t("common.close")}
          </Button>
          {canUpdate && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !dirty}
              onClick={() => void onSave()}
              title="Ctrl/⌘+S"
            >
              {t("files.save")}
            </Button>
          )}
        </Stack>
      </div>
      <Form.Control
        ref={textareaRef}
        as="textarea"
        className="file-editor-textarea"
        value={content}
        spellCheck={false}
        readOnly={!canUpdate}
        wrap="off"
        onKeyDown={onKeyDown}
        onChange={(e) => {
          if (!canUpdate) return;
          onChange(e.target.value);
        }}
      />
    </div>
  );
}
