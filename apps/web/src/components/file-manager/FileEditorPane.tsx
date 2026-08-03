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

  return (
    <div className="border rounded surface p-3 h-100">
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
        <strong className="font-monospace small text-break">{path}</strong>
        <Stack direction="horizontal" gap={2}>
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
            >
              {t("files.save")}
            </Button>
          )}
        </Stack>
      </div>
      <Form.Control
        as="textarea"
        className="file-editor-textarea"
        value={content}
        spellCheck={false}
        readOnly={!canUpdate}
        onChange={(e) => {
          if (!canUpdate) return;
          onChange(e.target.value);
        }}
      />
    </div>
  );
}
