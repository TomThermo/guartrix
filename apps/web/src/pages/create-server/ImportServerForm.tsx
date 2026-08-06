import { Alert, Form } from "react-bootstrap";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

export type ImportServerFormProps = {
  onArchiveChange: (file: File | null) => void;
};

/** Import-mode archive picker (shared fields live in ServerTypeNodeFields). */
export function ImportServerForm({ onArchiveChange }: ImportServerFormProps) {
  const { t } = useI18n();

  return (
    <AdminPanelCard title={t("createServer.sectionImport")} icon="fa-file-import">
      <Alert variant="secondary" className="small mb-3">
        {t("createServer.importHelp")}
      </Alert>
      <Form.Group className="mb-0" controlId="archive">
        <Form.Label>{t("createServer.importArchive")}</Form.Label>
        <Form.Control
          type="file"
          accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
          required
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            onArchiveChange(input.files?.[0] ?? null);
          }}
        />
      </Form.Group>
    </AdminPanelCard>
  );
}
