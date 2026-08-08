import { Button, Form, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { BackupTransferControls } from "./BackupTransferControls";

export function BackupCreateSection({
  note,
  onNoteChange,
  busy,
  uploading,
  onCreate,
  maxUploadLabel,
  uploadNote,
  onUploadNoteChange,
  uploadFile,
  onUploadFileChange,
  uploadPct,
  uploadLabel,
  onUpload,
  onCancelUpload,
}: {
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  uploading: boolean;
  onCreate: () => void;
  maxUploadLabel: string;
  uploadNote: string;
  onUploadNoteChange: (value: string) => void;
  uploadFile: File | null;
  onUploadFileChange: (file: File | null) => void;
  uploadPct: number;
  uploadLabel: string;
  onUpload: () => void;
  onCancelUpload: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h3 className="h6 mb-3">
        <i className="fa-solid fa-plus me-2" />
        {t("backups.create")}
      </h3>
      <Form.Group className="mb-3">
        <Form.Label>{t("backups.noteOptional")}</Form.Label>
        <Form.Control
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("backups.notePlaceholder")}
          maxLength={120}
          disabled={busy || uploading}
        />
      </Form.Group>
      <Button variant="primary" disabled={busy || uploading} onClick={onCreate}>
        {busy ? (
          <>
            <Spinner size="sm" className="me-2" /> {t("backups.creating")}
          </>
        ) : (
          <>
            <i className="fa-solid fa-floppy-disk me-2" />
            {t("backups.backupNow")}
          </>
        )}
      </Button>

      <hr className="my-4" />

      <BackupTransferControls
        maxUploadLabel={maxUploadLabel}
        uploadNote={uploadNote}
        onUploadNoteChange={onUploadNoteChange}
        uploadFile={uploadFile}
        onUploadFileChange={onUploadFileChange}
        uploading={uploading}
        uploadPct={uploadPct}
        uploadLabel={uploadLabel}
        busy={busy}
        onUpload={onUpload}
        onCancelUpload={onCancelUpload}
      />
    </>
  );
}
