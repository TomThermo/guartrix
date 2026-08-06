import { lazy, Suspense, useEffect, useState } from "react";
import { Button, Stack } from "react-bootstrap";
import type { OnMount } from "@monaco-editor/react";
import { useI18n } from "../../i18n/react";
import { monacoLanguageForPath } from "./monacoLanguage";
import { configureMonacoLoader } from "./monacoSetup";
import {
  monacoThemeIdForDocument,
  registerGuartrixMonacoThemes,
} from "./monacoTheme";

const MonacoEditor = lazy(() => {
  configureMonacoLoader();
  return import("@monaco-editor/react");
});

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
  onShowBrowser?: () => void;
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
  onShowBrowser,
}: Props) {
  const { t } = useI18n();
  const [themeId, setThemeId] = useState(monacoThemeIdForDocument);
  const language = monacoLanguageForPath(path);
  const fileName = path.split("/").pop() || path;

  useEffect(() => {
    const sync = () => setThemeId(monacoThemeIdForDocument());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-bs-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    registerGuartrixMonacoThemes(monaco);
    monaco.editor.setTheme(monacoThemeIdForDocument());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (canUpdate && dirty && !busy) onSave();
    });
    editor.focus();
  };

  return (
    <div className="file-editor-pane">
      <div className="file-editor-toolbar d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <div className="d-flex align-items-center gap-2 min-w-0">
          {onShowBrowser && (
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={busy}
              title={t("files.showBrowser")}
              onClick={onShowBrowser}
            >
              <i className="fa-solid fa-folder-open" />
            </Button>
          )}
          <strong className="font-monospace small text-break mb-0" title={path}>
            {fileName}
          </strong>
          <span className="badge text-bg-secondary text-uppercase">{language}</span>
        </div>
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
              <i className="fa-solid fa-floppy-disk me-1" />
              {t("files.save")}
            </Button>
          )}
        </Stack>
      </div>
      <div className="file-editor-monaco">
        <Suspense
          fallback={
            <div className="file-editor-loading text-secondary small p-3">
              {t("common.loading")}…
            </div>
          }
        >
          <MonacoEditor
            path={path}
            language={language}
            theme={themeId}
            value={content}
            onChange={(value) => {
              if (!canUpdate) return;
              onChange(value ?? "");
            }}
            onMount={handleMount}
            loading={
              <div className="file-editor-loading text-secondary small p-3">
                {t("common.loading")}…
              </div>
            }
            options={{
              readOnly: !canUpdate,
              fontSize: 13,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "off",
              tabSize: 2,
              automaticLayout: true,
              renderLineHighlight: "line",
              padding: { top: 8, bottom: 8 },
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
