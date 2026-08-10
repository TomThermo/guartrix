import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  BACKUP_UPLOAD_MAX_BYTES,
  type BackupSchedule,
  type BackupScheduleMode,
  type ServerBackup,
} from "@guartrix/shared";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { formatBytes, formatWhen } from "../../utils";

export function useBackupPanel({
  serverId,
  onError,
  onNotice,
  canCreate = true,
  canDelete = true,
  canRestore = true,
  canEditSchedule = true,
}: {
  serverId: string;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  canCreate?: boolean;
  canDelete?: boolean;
  canRestore?: boolean;
  canEditSchedule?: boolean;
}) {
  const { t } = useI18n();
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<BackupScheduleMode>("off");
  const [intervalHours, setIntervalHours] = useState(6);
  const [dailyAt, setDailyAt] = useState("03:00");
  const [cronExpression, setCronExpression] = useState("0 3 * * *");
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

  const maxUploadLabel = formatBytes(BACKUP_UPLOAD_MAX_BYTES);

  const refresh = useCallback(
    async (opts?: { syncForm?: boolean }) => {
      const data = await api.listBackups(serverId);
      setBackups(data.backups);
      setSchedule(data.schedule);
      setBusy(data.busy);
      if (opts?.syncForm) {
        setMode(data.schedule.mode);
        setIntervalHours(data.schedule.intervalHours);
        setDailyAt(data.schedule.dailyAt);
        setCronExpression(data.schedule.cronExpression || "0 3 * * *");
      }
    },
    [serverId],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError intentionally omitted
  }, [refresh, onError, t]);

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
          setUploadLabel(`${formatBytes(p.receivedBytes)} / ${formatBytes(p.totalBytes)}${speed}`);
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
        cronExpression,
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
      onNotice(startAfter ? t("backups.restoreStarting") : t("backups.restoreOnly"));
      setRestoreTarget(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("backups.restoreFailed"));
    } finally {
      setActionBusy(false);
      setBusy(false);
    }
  }

  return {
    t,
    backups,
    schedule,
    busy,
    loading,
    note,
    setNote,
    mode,
    setMode,
    intervalHours,
    setIntervalHours,
    dailyAt,
    setDailyAt,
    cronExpression,
    setCronExpression,
    savingSchedule,
    uploadNote,
    setUploadNote,
    uploadFile,
    setUploadFile,
    uploading,
    uploadPct,
    uploadLabel,
    downloadingId,
    downloadPct,
    deleteTarget,
    setDeleteTarget,
    restoreTarget,
    setRestoreTarget,
    actionBusy,
    maxUploadLabel,
    canCreate,
    canDelete,
    canRestore,
    canEditSchedule,
    onCreate,
    onUpload,
    onCancelUpload,
    onDownload,
    onCancelDownload,
    onSaveSchedule,
    onDelete,
    confirmDelete,
    onRestore,
    confirmRestore,
  };
}
