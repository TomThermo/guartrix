import {
  BACKUP_TRANSFER_CHUNK_BYTES,
  BACKUP_UPLOAD_CONCURRENCY,
  BACKUP_UPLOAD_MAX_BYTES,
} from "@msm/shared";
import type {
  BackupListResponse,
  BackupSchedule,
  BackupUploadInitResponse,
  McServer,
  ServerBackup,
} from "@msm/shared";
import { request, notifyUnauthorized, transferUrl, withCsrfHeaders, getCsrfToken } from "./client";

export const backupsApi = {
  listBackups: (id: string) => request<BackupListResponse>(`/api/servers/${id}/backups`),
  createBackup: (id: string, note?: string) =>
    request<{ backup: ServerBackup; schedule: BackupSchedule; busy: boolean }>(
      `/api/servers/${id}/backups`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  updateBackupSchedule: (
    id: string,
    schedule: Partial<
      Pick<BackupSchedule, "mode" | "intervalHours" | "dailyAt" | "cronExpression" | "keepCount">
    >,
  ) =>
    request<{ schedule: BackupSchedule }>(`/api/servers/${id}/backups/schedule`, {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  deleteBackup: (id: string, backupId: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/backups/${encodeURIComponent(backupId)}`, {
      method: "DELETE",
    }),
  restoreBackup: (id: string, backupId: string, startAfter?: boolean) =>
    request<{ ok: boolean; server: McServer }>(
      `/api/servers/${id}/backups/${encodeURIComponent(backupId)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ startAfter: Boolean(startAfter) }),
      },
    ),
  backupDownloadUrl: (id: string, backupId: string) =>
    transferUrl(`/api/servers/${id}/backups/${encodeURIComponent(backupId)}/download`),
  /**
   * Chunked backup upload: init → parallel 1 MiB PUTs (XHR progress) → complete.
   */
  uploadBackup: async (
    id: string,
    file: File,
    opts?: {
      note?: string;
      onProgress?: (p: {
        receivedBytes: number;
        totalBytes: number;
        phase?: "upload" | "finalize";
        speedBytesPerSec?: number;
      }) => void;
      signal?: AbortSignal;
    },
  ): Promise<ServerBackup> => {
    if (file.size <= 0) throw new Error("Empty file");
    if (file.size > BACKUP_UPLOAD_MAX_BYTES) {
      throw new Error("Backup too large (max 20 GB)");
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".tar.gz") && !lower.endsWith(".tgz") && !lower.endsWith(".zip")) {
      throw new Error("Backup must be a .tar.gz, .tgz or .zip file");
    }

    opts?.onProgress?.({
      receivedBytes: 0,
      totalBytes: file.size,
      phase: "upload",
      speedBytesPerSec: 0,
    });

    const init = await request<BackupUploadInitResponse>(`/api/servers/${id}/backups/upload/init`, {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        sizeBytes: file.size,
        note: opts?.note?.trim() || undefined,
      }),
      signal: opts?.signal,
    });

    const chunkSize = init.chunkSize || BACKUP_TRANSFER_CHUNK_BYTES;
    const totalChunks = init.totalChunks;
    let completedBytes = 0;
    const inFlight = new Map<number, number>();
    let lastBytes = 0;
    let lastAt = Date.now();
    let speedBps = 0;

    const report = (phase: "upload" | "finalize" = "upload") => {
      let flying = 0;
      for (const n of inFlight.values()) flying += n;
      const receivedBytes = Math.min(file.size, completedBytes + flying);
      const now = Date.now();
      const dt = (now - lastAt) / 1000;
      if (dt >= 0.25) {
        speedBps = (receivedBytes - lastBytes) / dt;
        lastBytes = receivedBytes;
        lastAt = now;
      }
      opts?.onProgress?.({
        receivedBytes,
        totalBytes: file.size,
        phase,
        speedBytesPerSec: speedBps,
      });
    };

    const putChunk = (index: number, blob: Blob): Promise<void> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "PUT",
          `/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}/chunks/${index}`,
        );
        xhr.withCredentials = true;
        xhr.timeout = 0;
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        const csrf = getCsrfToken();
        if (csrf) xhr.setRequestHeader("x-csrf-token", csrf);

        const onAbort = () => xhr.abort();
        opts?.signal?.addEventListener("abort", onAbort);

        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable) return;
          inFlight.set(index, ev.loaded);
          report("upload");
        };

        xhr.onerror = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          reject(new Error(`Chunk ${index} network error`));
        };
        xhr.ontimeout = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          reject(new Error(`Chunk ${index} timed out`));
        };
        xhr.onabort = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          reject(new DOMException("Upload aborted", "AbortError"));
        };
        xhr.onload = () => {
          opts?.signal?.removeEventListener("abort", onAbort);
          inFlight.delete(index);
          let data: { error?: unknown } = {};
          try {
            data = JSON.parse(xhr.responseText || "{}") as typeof data;
          } catch {
            // ignore
          }
          if (xhr.status === 401) {
            notifyUnauthorized();
            reject(new Error("Unauthorized"));
            return;
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            const message =
              typeof data.error === "string"
                ? data.error
                : data.error
                  ? JSON.stringify(data.error)
                  : xhr.statusText || `Chunk ${index} failed (${xhr.status})`;
            reject(new Error(message));
            return;
          }
          completedBytes += blob.size;
          report("upload");
          resolve();
        };

        inFlight.set(index, 0);
        xhr.send(blob);
      });

    const uploadOne = async (index: number): Promise<void> => {
      if (opts?.signal?.aborted) {
        throw new DOMException("Upload aborted", "AbortError");
      }
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      await putChunk(index, file.slice(start, end));
    };

    const concurrency = Math.max(1, Math.min(BACKUP_UPLOAD_CONCURRENCY, totalChunks));
    let next = 0;
    let firstError: unknown = null;

    const workers = Array.from({ length: concurrency }, async () => {
      while (!firstError) {
        const index = next++;
        if (index >= totalChunks) return;
        try {
          await uploadOne(index);
        } catch (err) {
          firstError = err;
          throw err;
        }
      }
    });

    try {
      await Promise.all(workers);
    } catch (err) {
      void fetch(`/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: withCsrfHeaders(),
      }).catch(() => undefined);
      throw err;
    }

    if (opts?.signal?.aborted) {
      void fetch(`/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: withCsrfHeaders(),
      }).catch(() => undefined);
      throw new DOMException("Upload aborted", "AbortError");
    }

    report("finalize");
    const done = await request<{ backup: ServerBackup }>(
      `/api/servers/${id}/backups/upload/${encodeURIComponent(init.uploadId)}/complete`,
      { method: "POST", body: JSON.stringify({}), signal: opts?.signal },
    );
    return done.backup;
  },
  /**
   * Download a backup (streamed). Prefer File System Access when available;
   * otherwise trigger a normal browser download.
   */
  downloadBackupChunked: async (
    id: string,
    backupId: string,
    fileName: string,
    opts?: {
      onProgress?: (p: { receivedBytes: number; totalBytes: number }) => void;
      signal?: AbortSignal;
    },
  ): Promise<void> => {
    const url = transferUrl(`/api/servers/${id}/backups/${encodeURIComponent(backupId)}/download`);

    const picker = (
      window as unknown as {
        showSaveFilePicker?: (opts: {
          suggestedName: string;
          types?: Array<{
            description: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<{
          createWritable: () => Promise<{
            write: (data: AllowSharedBufferSource) => Promise<void>;
            close: () => Promise<void>;
            abort: () => Promise<void>;
          }>;
        }>;
      }
    ).showSaveFilePicker;

    if (typeof picker !== "function") {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      opts?.onProgress?.({ receivedBytes: 1, totalBytes: 1 });
      return;
    }

    const handle = await picker({
      suggestedName: fileName,
      types: [
        {
          description: "Backup archive",
          accept: { "application/gzip": [".gz", ".tgz"] },
        },
      ],
    });
    const writable = await handle.createWritable();

    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: opts?.signal,
      });
      if (!res.ok) {
        if (res.status === 401) notifyUnauthorized();
        throw new Error(`Download failed (${res.status})`);
      }
      const totalBytes = Number(res.headers.get("Content-Length") || "0");
      if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        await writable.write(buf);
        await writable.close();
        opts?.onProgress?.({ receivedBytes: buf.length, totalBytes: buf.length });
        return;
      }

      const reader = res.body.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          await writable.write(value);
          received += value.length;
          opts?.onProgress?.({
            receivedBytes: received,
            totalBytes: totalBytes || received,
          });
        }
      }
      await writable.close();
    } catch (err) {
      await writable.abort().catch(() => undefined);
      throw err;
    }
  },
};
