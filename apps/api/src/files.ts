import {
  daemonCompressFiles,
  daemonDecompressFile,
  daemonDeleteFile,
  daemonDownloadFile,
  daemonDownloadZip,
  daemonListFiles,
  daemonMkdir,
  daemonReadFile,
  daemonRename,
  daemonWriteFile,
} from "./daemon-client.js";
import { FILE_UPLOAD_MAX_BYTES } from "@msm/shared";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { openAsBlob } from "node:fs";

export const TEXT_MAX_BYTES = 2 * 1024 * 1024;
export const UPLOAD_MAX_BYTES = FILE_UPLOAD_MAX_BYTES;

export async function listFiles(serverId: string, relPath = ".") {
  return daemonListFiles(serverId, relPath);
}

export async function readFileContent(serverId: string, relPath: string) {
  return daemonReadFile(serverId, relPath);
}

export async function writeFileContent(
  serverId: string,
  relPath: string,
  content: string,
) {
  return daemonWriteFile(serverId, relPath, content);
}

export async function createDirectory(serverId: string, relPath: string) {
  return daemonMkdir(serverId, relPath);
}

export async function deletePath(serverId: string, relPath: string) {
  return daemonDeleteFile(serverId, relPath);
}

export async function renamePath(serverId: string, from: string, to: string) {
  return daemonRename(serverId, from, to);
}

export async function downloadFile(serverId: string, relPath: string) {
  return daemonDownloadFile(serverId, relPath);
}

export async function compressFiles(
  serverId: string,
  paths: string[],
  destination: string,
) {
  return daemonCompressFiles(serverId, paths, destination);
}

export async function downloadZip(serverId: string, paths: string[]) {
  return daemonDownloadZip(serverId, paths);
}

export async function decompressFile(
  serverId: string,
  archivePath: string,
  destination?: string,
) {
  return daemonDecompressFile(serverId, archivePath, destination);
}

/**
 * Stream upload to a temp file (no RAM buffer), then forward to the daemon via
 * openAsBlob so large worlds/jars don't OOM the API.
 */
export async function saveUpload(
  serverId: string,
  destDir: string,
  filename: string,
  stream: NodeJS.ReadableStream,
): Promise<{ path: string; size: number }> {
  const { resolveNodeForServer, daemonFetch } = await import("./daemon-client.js");
  const tmp = path.join(
    os.tmpdir(),
    `guartrix-upload-${serverId}-${Date.now()}-${path.basename(filename).slice(0, 40)}`,
  );
  try {
    await pipeline(stream as never, createWriteStream(tmp));
    const st = await fs.stat(tmp);
    if (st.size > UPLOAD_MAX_BYTES) {
      throw new Error(
        `File too large (max ${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB)`,
      );
    }
    const { node } = await resolveNodeForServer(serverId);
    const form = new FormData();
    form.append("file", await openAsBlob(tmp), filename);
    const q = new URLSearchParams({ path: destDir });
    const res = await daemonFetch(
      node,
      `/servers/${serverId}/files/upload?${q}`,
      { method: "POST", body: form },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `Upload failed (${res.status})`);
    }
    return JSON.parse(text) as { path: string; size: number };
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}
