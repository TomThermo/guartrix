import { lazy, Suspense, useEffect, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import { useI18n } from "../../i18n/react";
import { configureMonacoLoader } from "../../components/file-manager/monacoSetup";
import {
  monacoThemeIdForDocument,
  registerGuartrixMonacoThemes,
} from "../../components/file-manager/monacoTheme";

const MonacoEditor = lazy(() => {
  configureMonacoLoader();
  return import("@monaco-editor/react");
});

export function MailCodeEditor({
  language,
  value,
  disabled,
  path,
  onChange,
  onSave,
}: {
  language: "html" | "plaintext";
  value: string;
  disabled?: boolean;
  path: string;
  onChange: (value: string) => void;
  onSave?: () => void;
}) {
  const { t } = useI18n();
  const [themeId, setThemeId] = useState(monacoThemeIdForDocument);

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
    if (onSave) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (!disabled) onSave();
      });
    }
  };

  return (
    <div className="mail-template-editor__monaco">
      <Suspense
        fallback={
          <div className="mail-template-editor__monaco-loading">{t("common.loading")}…</div>
        }
      >
        <MonacoEditor
          path={path}
          language={language}
          theme={themeId}
          value={value}
          onChange={(next) => {
            if (disabled) return;
            onChange(next ?? "");
          }}
          onMount={handleMount}
          loading={
            <div className="mail-template-editor__monaco-loading">{t("common.loading")}…</div>
          }
          options={{
            readOnly: Boolean(disabled),
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
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
  );
}
