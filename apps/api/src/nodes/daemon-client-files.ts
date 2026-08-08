import {
  DAEMON_LONG_TIMEOUT_MS,
  DaemonHttpError,
  daemonFetch,
  daemonJson,
  resolveNodeForServer,
} from "./daemon-client-core.js";

export async function daemonListFiles(serverId: string, relPath: string) {
  const { node } = await resolveNodeForServer(serverId);
  const q = new URLSearchParams({ path: relPath });
  return daemonJson(node, `/servers/${serverId}/files?${q}`);
}

export async function daemonReadFile(serverId: string, relPath: string) {
  const { node } = await resolveNodeForServer(serverId);
  const q = new URLSearchParams({ path: relPath });
  return daemonJson(node, `/servers/${serverId}/files/content?${q}`);
}

export async function daemonWriteFile(serverId: string, relPath: string, content: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, `/servers/${serverId}/files/content`, {
    method: "PUT",
    body: JSON.stringify({ path: relPath, content }),
  });
}

export async function daemonMkdir(serverId: string, relPath: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, `/servers/${serverId}/files/mkdir`, {
    method: "POST",
    body: JSON.stringify({ path: relPath }),
  });
}

export async function daemonRename(serverId: string, from: string, to: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, `/servers/${serverId}/files/rename`, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

export async function daemonDeleteFile(serverId: string, relPath: string) {
  const { node } = await resolveNodeForServer(serverId);
  const q = new URLSearchParams({ path: relPath });
  const res = await daemonFetch(node, `/servers/${serverId}/files?${q}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Daemon error ${res.status}`, res.status);
  }
}

export async function daemonDownloadFile(serverId: string, relPath: string): Promise<Response> {
  const { node } = await resolveNodeForServer(serverId);
  const q = new URLSearchParams({ path: relPath });
  const res = await daemonFetch(node, `/servers/${serverId}/files/download?${q}`, {
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Daemon error ${res.status}`, res.status);
  }
  return res;
}

export async function daemonCompressFiles(serverId: string, paths: string[], destination: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean; path: string; size: number }>(
    node,
    `/servers/${serverId}/files/compress`,
    {
      method: "POST",
      body: JSON.stringify({ paths, destination }),
    },
  );
}

export async function daemonDownloadZip(serverId: string, paths: string[]): Promise<Response> {
  const { node } = await resolveNodeForServer(serverId);
  const res = await daemonFetch(node, `/servers/${serverId}/files/download-zip`, {
    method: "POST",
    body: JSON.stringify({ paths }),
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Daemon error ${res.status}`, res.status);
  }
  return res;
}

export async function daemonDecompressFile(
  serverId: string,
  archivePath: string,
  destination?: string,
) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean; path: string }>(node, `/servers/${serverId}/files/decompress`, {
    method: "POST",
    body: JSON.stringify({
      path: archivePath,
      ...(destination ? { destination } : {}),
    }),
  });
}
