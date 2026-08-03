import type {
  FileContentResponse,
  FileListResponse,
} from "@msm/shared";
import { request } from "./client";

export const filesApi = {
  listFiles: (id: string, path = ".") =>
    request<FileListResponse>(
      `/api/servers/${id}/files?path=${encodeURIComponent(path)}`,
    ),
  readFile: (id: string, path: string) =>
    request<FileContentResponse>(
      `/api/servers/${id}/files/content?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (id: string, path: string, content: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/files/content`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  mkdir: (id: string, path: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  renameFile: (id: string, from: string, to: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/files/rename`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  deleteFile: (id: string, path: string) =>
    request<void>(
      `/api/servers/${id}/files?path=${encodeURIComponent(path)}`,
      { method: "DELETE" },
    ),
  uploadFile: async (id: string, dirPath: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(
      `/api/servers/${id}/files/upload?path=${encodeURIComponent(dirPath || ".")}`,
      { method: "POST", credentials: "include", body },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    return data as { ok: boolean; path: string; size: number };
  },
  downloadFile: async (id: string, path: string, fileName: string) => {
    const res = await fetch(
      `/api/servers/${id}/files/download?path=${encodeURIComponent(path)}`,
      { credentials: "include" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  compressFiles: (id: string, paths: string[], destination: string) =>
    request<{ ok: boolean; path: string; size: number }>(
      `/api/servers/${id}/files/compress`,
      {
        method: "POST",
        body: JSON.stringify({ paths, destination }),
      },
    ),
  downloadZip: async (id: string, paths: string[], fileName = "download.zip") => {
    const res = await fetch(`/api/servers/${id}/files/download-zip`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data.error === "string" ? data.error : res.statusText,
      );
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "download.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  decompressFile: (id: string, path: string, destination?: string) =>
    request<{ ok: boolean; path: string }>(
      `/api/servers/${id}/files/decompress`,
      {
        method: "POST",
        body: JSON.stringify({
          path,
          ...(destination ? { destination } : {}),
        }),
      },
    ),
};
