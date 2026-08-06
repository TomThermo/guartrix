import { Alert } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type DoneStepProps = {
  installOk: boolean;
  testSummary: string | null;
  nodeLabel: string;
  log: string;
};

export function DoneStep({
  installOk,
  testSummary,
  nodeLabel,
  log,
}: DoneStepProps) {
  const { t } = useI18n();

  return (
    <div>
      <Alert variant={installOk ? "success" : "warning"}>
        {installOk
          ? t("admin.daemonInstalled")
          : t("admin.installFinishedWarnings")}
      </Alert>
      {testSummary && <p className="mb-2">{testSummary}</p>}
      <ol className="mb-0">
        <li>{t("admin.doneCheckOnline")}</li>
        <li>{t("admin.doneCheckFirewall")}</li>
        <li>{t("admin.doneCreateServer", { name: nodeLabel })}</li>
      </ol>
      {log && (
        <details className="mt-3">
          <summary className="small text-secondary">Install log</summary>
          <pre
            className="bg-dark text-light p-2 rounded small mt-2"
            style={{ maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }}
          >
            {log}
          </pre>
        </details>
      )}
    </div>
  );
}
