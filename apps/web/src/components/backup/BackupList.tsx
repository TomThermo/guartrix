import type { ServerBackup } from "@msm/shared";
import { Badge, Button, ListGroup, ProgressBar, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatWhen } from "../../utils";
import { EmptyState } from "../EmptyState";

function triggerBadge(
  trigger: ServerBackup["trigger"],
  t: (key: string) => string,
): {
  bg: string;
  label: string;
} {
  if (trigger === "scheduled") {
    return { bg: "primary", label: t("backups.triggerScheduled") };
  }
  if (trigger === "uploaded") {
    return { bg: "info", label: t("backups.triggerUploaded") };
  }
  return { bg: "secondary", label: t("backups.triggerManual") };
}

interface Props {
  backups: ServerBackup[];
  busy: boolean;
  uploading: boolean;
  downloadingId: string | null;
  downloadPct: number;
  canDelete: boolean;
  canRestore: boolean;
  onDownload: (backup: ServerBackup) => void;
  onCancelDownload: () => void;
  onRestore: (backup: ServerBackup) => void;
  onDelete: (backup: ServerBackup) => void;
}

export function BackupList({
  backups,
  busy,
  uploading,
  downloadingId,
  downloadPct,
  canDelete,
  canRestore,
  onDownload,
  onCancelDownload,
  onRestore,
  onDelete,
}: Props) {
  const { t } = useI18n();

  return (
    <>
      <h3 className="h6 mb-3">
        <i className="fa-solid fa-box-archive me-2" />
        {t("backups.listTitle", { count: backups.length })}
      </h3>
      <ListGroup>
        {backups.length === 0 && (
          <ListGroup.Item>
            <EmptyState message={t("backups.empty")} />
          </ListGroup.Item>
        )}
        {backups.map((b) => {
          const badge = triggerBadge(b.trigger, t);
          const isDownloading = downloadingId === b.id;
          return (
            <ListGroup.Item
              key={b.id}
              className="d-flex justify-content-between align-items-center gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <div className="fw-semibold font-monospace text-break">{b.fileName}</div>
                <div className="small text-secondary">
                  {formatWhen(b.createdAt)} · {b.sizeLabel}
                  {b.note ? ` · ${b.note}` : ""}
                </div>
                <Badge bg={badge.bg} className="mt-1">
                  {badge.label}
                </Badge>
                {b.encrypted ? (
                  <Badge bg="dark" className="mt-1 ms-1" title={t("backups.encryptedAtRest")}>
                    <i className="fa-solid fa-lock me-1" />
                    {t("backups.encrypted")}
                  </Badge>
                ) : null}
                {isDownloading && (
                  <div className="mt-2" style={{ minWidth: 180 }}>
                    <ProgressBar now={downloadPct} label={`${downloadPct}%`} />
                  </div>
                )}
              </div>
              <Stack direction="horizontal" gap={2}>
                {isDownloading ? (
                  <Button size="sm" variant="outline-secondary" onClick={onCancelDownload}>
                    {t("common.cancel")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={Boolean(downloadingId) || uploading}
                    onClick={() => void onDownload(b)}
                  >
                    <i className="fa-solid fa-download me-1" />
                    {t("backups.download")}
                  </Button>
                )}
                {canRestore && (
                  <Button
                    size="sm"
                    variant="outline-warning"
                    disabled={busy || uploading}
                    onClick={() => onRestore(b)}
                  >
                    <i className="fa-solid fa-clock-rotate-left me-1" />
                    {t("backups.restore")}
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="outline-danger" onClick={() => onDelete(b)}>
                    {t("backups.delete")}
                  </Button>
                )}
              </Stack>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </>
  );
}
