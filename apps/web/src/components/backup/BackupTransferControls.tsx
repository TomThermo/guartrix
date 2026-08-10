import { BACKUP_UPLOAD_MAX_BYTES } from "@guartrix/shared";
import { Button, Form, ProgressBar, Spinner, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatBytes } from "../../utils";

interface Props {
  maxUploadLabel?: string;
  uploadNote: string;
  onUploadNoteChange: (value: string) => void;
  uploadFile: File | null;
  onUploadFileChange: (file: File | null) => void;
  uploading: boolean;
  uploadPct: number;
  uploadLabel: string;
  busy: boolean;
  onUpload: () => void;
  onCancelUpload: () => void;
}

export function BackupTransferControls({
  maxUploadLabel = formatBytes(BACKUP_UPLOAD_MAX_BYTES),
  uploadNote,
  onUploadNoteChange,
  uploadFile,
  onUploadFileChange,
  uploading,
  uploadPct,
  uploadLabel,
  busy,
  onUpload,
  onCancelUpload,
}: Props) {
  const { t } = useI18n();

  return (
    <>
      <h3 className="h6 mb-3">
        <i className="fa-solid fa-cloud-arrow-up me-2" />
        {t("backups.uploadTitle")}
      </h3>
      <Form.Group className="mb-3">
        <Form.Label>{t("backups.uploadFormats", { max: maxUploadLabel })}</Form.Label>
        <Form.Control
          type="file"
          accept=".tar.gz,.tgz,.zip,application/gzip,application/x-gzip,application/zip,application/x-zip-compressed"
          disabled={uploading || busy}
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0] ?? null;
            onUploadFileChange(file);
          }}
        />
        {uploadFile && (
          <Form.Text className="text-secondary">
            {uploadFile.name} · {formatBytes(uploadFile.size)}
          </Form.Text>
        )}
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>{t("backups.noteOptional")}</Form.Label>
        <Form.Control
          value={uploadNote}
          onChange={(e) => onUploadNoteChange(e.target.value)}
          placeholder={t("backups.uploadNotePlaceholder")}
          maxLength={120}
          disabled={uploading || busy}
        />
      </Form.Group>
      {uploading && (
        <div className="mb-3">
          <ProgressBar now={uploadPct} label={`${uploadPct}%`} className="mb-1" />
          <div className="small text-secondary">{uploadLabel}</div>
        </div>
      )}
      <Stack direction="horizontal" gap={2}>
        <Button
          variant="outline-primary"
          disabled={uploading || busy || !uploadFile}
          onClick={() => void onUpload()}
        >
          {uploading ? (
            <>
              <Spinner size="sm" className="me-2" /> {t("backups.uploading")}
            </>
          ) : (
            <>
              <i className="fa-solid fa-cloud-arrow-up me-2" />
              {t("common.upload")}
            </>
          )}
        </Button>
        {uploading && (
          <Button variant="outline-secondary" onClick={onCancelUpload}>
            {t("common.cancel")}
          </Button>
        )}
      </Stack>
    </>
  );
}
