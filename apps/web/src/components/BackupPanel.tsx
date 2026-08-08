import { Col, Row } from "react-bootstrap";
import { ConfirmModal } from "./ConfirmModal";
import { TabLoading } from "./TabLoading";
import { BackupCreateSection } from "./backup/BackupCreateSection";
import { BackupList } from "./backup/BackupList";
import { BackupScheduleSection } from "./backup/BackupScheduleSection";
import { useBackupPanel } from "./backup/useBackupPanel";

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canCreate?: boolean;
  canDelete?: boolean;
  canRestore?: boolean;
  canEditSchedule?: boolean;
}

export function BackupPanel(props: Props) {
  const s = useBackupPanel(props);
  const { t } = s;

  if (s.loading || !s.schedule) {
    return <TabLoading py="md" />;
  }

  return (
    <div>
      <h2 className="h5 mb-1">{t("backups.title")}</h2>
      <p className="small text-secondary mb-4">
        {t("backups.retentionReadOnly", { n: s.schedule.keepCount })}
      </p>

      <Row className="g-4 mb-4">
        {s.canCreate && (
          <Col lg={5}>
            <BackupCreateSection
              note={s.note}
              onNoteChange={s.setNote}
              busy={s.busy}
              uploading={s.uploading}
              onCreate={() => void s.onCreate()}
              maxUploadLabel={s.maxUploadLabel}
              uploadNote={s.uploadNote}
              onUploadNoteChange={s.setUploadNote}
              uploadFile={s.uploadFile}
              onUploadFileChange={s.setUploadFile}
              uploadPct={s.uploadPct}
              uploadLabel={s.uploadLabel}
              onUpload={() => void s.onUpload()}
              onCancelUpload={s.onCancelUpload}
            />
          </Col>
        )}

        {s.canEditSchedule && (
          <Col lg={s.canCreate ? 7 : 12}>
            <BackupScheduleSection
              schedule={s.schedule}
              mode={s.mode}
              onModeChange={s.setMode}
              intervalHours={s.intervalHours}
              onIntervalHoursChange={s.setIntervalHours}
              dailyAt={s.dailyAt}
              onDailyAtChange={s.setDailyAt}
              cronExpression={s.cronExpression}
              onCronExpressionChange={s.setCronExpression}
              savingSchedule={s.savingSchedule}
              onSaveSchedule={(e) => void s.onSaveSchedule(e)}
            />
          </Col>
        )}
      </Row>

      <BackupList
        backups={s.backups}
        busy={s.busy}
        uploading={s.uploading}
        downloadingId={s.downloadingId}
        downloadPct={s.downloadPct}
        canDelete={s.canDelete}
        canRestore={s.canRestore}
        onDownload={(b) => void s.onDownload(b)}
        onCancelDownload={s.onCancelDownload}
        onRestore={s.onRestore}
        onDelete={s.onDelete}
      />

      <ConfirmModal
        show={Boolean(s.deleteTarget)}
        title={t("backups.deleteTitle")}
        body={s.deleteTarget ? t("backups.deleteBody", { fileName: s.deleteTarget.fileName }) : ""}
        confirmLabel={t("common.delete")}
        variant="danger"
        busy={s.actionBusy}
        onCancel={() => {
          if (s.actionBusy) return;
          s.setDeleteTarget(null);
        }}
        onConfirm={() => void s.confirmDelete()}
      />
      <ConfirmModal
        show={Boolean(s.restoreTarget)}
        title={t("backups.restoreTitle")}
        body={
          s.restoreTarget ? (
            <>
              <p className="mb-2">
                {t("backups.restoreBody", { fileName: s.restoreTarget.fileName })}
              </p>
              <p className="text-secondary small mb-0">{t("backups.restoreWarning")}</p>
            </>
          ) : (
            ""
          )
        }
        confirmLabel={t("backups.restoreAndStart")}
        secondaryLabel={t("backups.restoreOnlyLabel")}
        variant="warning"
        busy={s.actionBusy}
        onCancel={() => {
          if (s.actionBusy) return;
          s.setRestoreTarget(null);
        }}
        onSecondary={() => void s.confirmRestore(false)}
        onConfirm={() => void s.confirmRestore(true)}
      />
    </div>
  );
}
