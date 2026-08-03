import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  BACKUP_UPLOAD_MAX_BYTES,
  type BackupSchedule,
  type BackupScheduleMode,
  type ServerBackup,
} from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  ListGroup,
  ProgressBar,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatBytes, formatWhen } from "../utils";
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canCreate?: boolean;
  canDelete?: boolean;
  canRestore?: boolean;
  canEditSchedule?: boolean;
}

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

export function BackupPanel({
  serverId,
  onError,
  onNotice,
  canCreate = true,
  canDelete = true,
  canRestore = true,
  canEditSchedule = true,
}: Props) {
  const { t } = useI18n();
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<BackupScheduleMode>("off");
  const [intervalHours, setIntervalHours] = useState(6);
  const [dailyAt, setDailyAt] = useState("03:00");
  const [keepCount, setKeepCount] = useState(7);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [uploadNote, setUploadNote] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const uploadAbortRef = useRef<AbortController | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState(0);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerBackup | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ServerBackup | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [encryptionEnabled, setEncryptionEnabled] = useState(false);

  const maxUploadLabel = formatBytes(BACKUP_UPLOAD_MAX_BYTES);

  const refresh = useCallback(async (opts?: { syncForm?: boolean }) => {
    const data = await api.listBackups(serverId);
    setBackups(data.backups);
    setSchedule(data.schedule);
    setBusy(data.busy);
    setEncryptionEnabled(Boolean(data.encryptionEnabled));
    if (opts?.syncForm) {
      setMode(data.schedule.mode);
      setIntervalHours(data.schedule.intervalHours);
      setDailyAt(data.schedule.dailyAt);
      setKeepCount(data.schedule.keepCount);
    }
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh({ syncForm: true })
      .catch((err) => {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : t("backups.loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only reload when switching servers — not when parent re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError intentionally omitted
  }, [refresh]);

  // Soft-poll while a backup is running; otherwise only every 30s for list updates
  useEffect(() => {
    if (uploading || downloadingId) return;
    const ms = busy ? 3000 : 30_000;
    const pollTimer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, ms);
    return () => clearInterval(pollTimer);
  }, [refresh, uploading, downloadingId, busy]);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
      downloadAbortRef.current?.abort();
    };
  }, []);

  async function onCreate() {
    if (!canCreate) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.createBackup(serverId, note.trim() || undefined);
      setNote("");
      setBackups((prev) => [result.backup, ...prev.filter((b) => b.id !== result.backup.id)]);
      setSchedule(result.schedule);
      onNotice(
        t("backups.noticeCreated", {
          fileName: result.backup.fileName,
          size: result.backup.sizeLabel,
        }),
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("backups.backupFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload() {
    if (!canCreate) return;
    if (!uploadFile) {
      onError(t("backups.chooseFileFirst"));
      return;
    }
    onError(null);
    onNotice(null);
    setUploading(true);
    setUploadPct(0);
    setUploadLabel(t("backups.uploadStarting"));
    const ac = new AbortController();
    uploadAbortRef.current = ac;
    try {
      const backup = await api.uploadBackup(serverId, uploadFile, {
        note: uploadNote.trim() || undefined,
        signal: ac.signal,
        onProgress: (p) => {
          const pct = Math.min(100, Math.round((p.receivedBytes / p.totalBytes) * 100));
          setUploadPct(pct);
          if (p.phase === "finalize") {
            setUploadLabel(
              uploadFile?.name.toLowerCase().endsWith(".zip")
                ? t("backups.uploadUnpacking")
                : t("backups.uploadSaving"),
            );
            return;
          }
          const speed =
            p.speedBytesPerSec && p.speedBytesPerSec > 0
              ? ` · ${formatBytes(p.speedBytesPerSec)}/s`
              : "";
          setUploadLabel(
            `${formatBytes(p.receivedBytes)} / ${formatBytes(p.totalBytes)}${speed}`,
          );
        },
      });
      setUploadFile(null);
      setUploadNote("");
      setUploadPct(100);
      setUploadLabel(t("backups.uploadDone"));
      onNotice(
        t("backups.noticeUploaded", {
          fileName: backup.fileName,
          size: backup.sizeLabel,
        }),
      );
      await refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onNotice(t("backups.uploadCancelled"));
      } else {
        onError(err instanceof Error ? err.message : t("backups.uploadFailed"));
      }
    } finally {
      setUploading(false);
      uploadAbortRef.current = null;
    }
  }

  function onCancelUpload() {
    uploadAbortRef.current?.abort();
  }

  async function onDownload(backup: ServerBackup) {
    onError(null);
    onNotice(null);
    setDownloadingId(backup.id);
    setDownloadPct(0);
    const ac = new AbortController();
    downloadAbortRef.current = ac;
    try {
      await api.downloadBackupChunked(serverId, backup.id, backup.fileName, {
        signal: ac.signal,
        onProgress: (p) => {
          setDownloadPct(Math.min(100, Math.round((p.receivedBytes / p.totalBytes) * 100)));
        },
      });
      onNotice(t("backups.noticeDownloaded", { fileName: backup.fileName }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onNotice(t("backups.downloadCancelled"));
      } else {
        onError(err instanceof Error ? err.message : t("backups.downloadFailed"));
      }
    } finally {
      setDownloadingId(null);
      downloadAbortRef.current = null;
    }
  }

  function onCancelDownload() {
    downloadAbortRef.current?.abort();
  }

  async function onSaveSchedule(e: FormEvent) {
    e.preventDefault();
    if (!canEditSchedule) return;
    setSavingSchedule(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.updateBackupSchedule(serverId, {
        mode,
        intervalHours,
        dailyAt,
        keepCount,
      });
      setSchedule(result.schedule);
      onNotice(
        result.schedule.mode === "off"
          ? t("backups.scheduleDisabled")
          : t("backups.scheduleSaved", {
              when: formatWhen(result.schedule.nextRunAt),
            }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("backups.saveScheduleFailed"));
    } finally {
      setSavingSchedule(false);
    }
  }

  function onDelete(backup: ServerBackup) {
    if (!canDelete) return;
    setDeleteTarget(backup);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.deleteBackup(serverId, deleteTarget.id);
      setBackups((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      onNotice(t("backups.deleted"));
      setDeleteTarget(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("backups.deleteFailed"));
    } finally {
      setActionBusy(false);
    }
  }

  function onRestore(backup: ServerBackup) {
    if (!canRestore) return;
    setRestoreTarget(backup);
  }

  async function confirmRestore(startAfter: boolean) {
    if (!restoreTarget) return;
    onError(null);
    onNotice(null);
    setActionBusy(true);
    setBusy(true);
    try {
      await api.restoreBackup(serverId, restoreTarget.id, startAfter);
      onNotice(
        startAfter ? t("backups.restoreStarting") : t("backups.restoreOnly"),
      );
      setRestoreTarget(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("backups.restoreFailed"));
    } finally {
      setActionBusy(false);
      setBusy(false);
    }
  }

  if (loading || !schedule) {
    return (
      <div className="text-center py-4 text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-3">{t("backups.title")}</h2>
      <Alert variant="light" className="border small">
        {t("backups.help", { max: maxUploadLabel })}
        {encryptionEnabled ? <> {t("backups.helpEncrypted")}</> : null}
      </Alert>

      <Row className="g-4 mb-4">
        {canCreate && (
          <Col lg={5}>
            <h3 className="h6 mb-3">
              <i className="fa-solid fa-plus me-2" />
              {t("backups.create")}
            </h3>
            <Form.Group className="mb-3">
              <Form.Label>{t("backups.noteOptional")}</Form.Label>
              <Form.Control
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("backups.notePlaceholder")}
                maxLength={120}
                disabled={busy || uploading}
              />
            </Form.Group>
            <Button variant="primary" disabled={busy || uploading} onClick={() => void onCreate()}>
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
                  setUploadFile(file);
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
                onChange={(e) => setUploadNote(e.target.value)}
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
          </Col>
        )}

        {canEditSchedule && (
          <Col lg={canCreate ? 7 : 12}>
          <h3 className="h6 mb-3">
            <i className="fa-solid fa-clock me-2" />
            {t("backups.scheduleTitle")}
          </h3>
          <Form onSubmit={(e) => void onSaveSchedule(e)}>
            <Form.Group className="mb-3">
              <Form.Label>{t("backups.mode")}</Form.Label>
              <Form.Select
                value={mode}
                onChange={(e) => setMode(e.target.value as BackupScheduleMode)}
              >
                <option value="off">{t("backups.modeOff")}</option>
                <option value="interval">{t("backups.modeInterval")}</option>
                <option value="daily">{t("backups.modeDaily")}</option>
              </Form.Select>
            </Form.Group>

            {mode === "interval" && (
              <Form.Group className="mb-3">
                <Form.Label>{t("backups.intervalHours")}</Form.Label>
                <Form.Select
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 6, 8, 12, 24, 48].map((h) => (
                    <option key={h} value={h}>
                      {t("backups.everyHours", {
                        h,
                        plural: h === 1 ? "" : "s",
                      })}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}

            {mode === "daily" && (
              <Form.Group className="mb-3">
                <Form.Label>{t("backups.timeLocal")}</Form.Label>
                <Form.Control
                  type="time"
                  value={dailyAt}
                  onChange={(e) => setDailyAt(e.target.value)}
                  required
                />
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>{t("backups.keepLast")}</Form.Label>
              <Form.Select
                value={keepCount}
                onChange={(e) => setKeepCount(Number(e.target.value))}
              >
                {[3, 5, 7, 10, 14, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {t("backups.backupsCount", { n })}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <div className="small text-secondary mb-3">
              {t("backups.lastRun", { when: formatWhen(schedule.lastRunAt) })}
              <br />
              {t("backups.nextRun", { when: formatWhen(schedule.nextRunAt) })}
            </div>

            <Button type="submit" variant="outline-primary" disabled={savingSchedule}>
              {savingSchedule ? t("common.saving") : t("common.save")}
            </Button>
          </Form>
          </Col>
        )}
      </Row>

      <h3 className="h6 mb-3">
        <i className="fa-solid fa-box-archive me-2" />
        {t("backups.listTitle", { count: backups.length })}
      </h3>
      <ListGroup>
        {backups.length === 0 && (
          <ListGroup.Item className="text-secondary">{t("backups.empty")}</ListGroup.Item>
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

      <ConfirmModal
        show={Boolean(deleteTarget)}
        title={t("backups.deleteTitle")}
        body={
          deleteTarget
            ? t("backups.deleteBody", { fileName: deleteTarget.fileName })
            : ""
        }
        confirmLabel={t("common.delete")}
        variant="danger"
        busy={actionBusy}
        onCancel={() => {
          if (actionBusy) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
      <ConfirmModal
        show={Boolean(restoreTarget)}
        title={t("backups.restoreTitle")}
        body={
          restoreTarget ? (
            <>
              <p className="mb-2">
                {t("backups.restoreBody", { fileName: restoreTarget.fileName })}
              </p>
              <p className="text-secondary small mb-0">
                {t("backups.restoreWarning")}
              </p>
            </>
          ) : (
            ""
          )
        }
        confirmLabel={t("backups.restoreAndStart")}
        secondaryLabel={t("backups.restoreOnlyLabel")}
        variant="warning"
        busy={actionBusy}
        onCancel={() => {
          if (actionBusy) return;
          setRestoreTarget(null);
        }}
        onSecondary={() => void confirmRestore(false)}
        onConfirm={() => void confirmRestore(true)}
      />
    </div>
  );
}
