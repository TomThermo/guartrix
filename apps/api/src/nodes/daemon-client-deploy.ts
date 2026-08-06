import {
  DAEMON_LONG_TIMEOUT_MS,
  DaemonHttpError,
  daemonFetch,
  resolveNode,
  resolveNodeForServer,
} from "./daemon-client-core.js";
import { panelToDaemonAuthorization } from "@msm/shared/daemon-jwt";
import { nodePublicUrl } from "./nodes.js";

/** Dest node pulls archive from source node and deploys (no panel disk staging). */
export async function daemonPeerDeployArchiveOnNode(
  serverId: string,
  fromNodeId: string,
  toNodeId: string,
): Promise<{ bytes: number | null }> {
  const from = await resolveNode(fromNodeId);
  const to = await resolveNode(toNodeId);
  const sourceExportUrl = `${nodePublicUrl(from)}/servers/${serverId}/export`;
  const sourceAuthorization = `Bearer ${panelToDaemonAuthorization(from.id, from.token, {
    ttlSec: 30 * 60,
  })}`;
  const data = await daemonFetch(to, `/servers/${serverId}/deploy-from`, {
    method: "POST",
    body: JSON.stringify({ sourceExportUrl, sourceAuthorization }),
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!data.ok) {
    const text = await data.text();
    throw new DaemonHttpError(
      text || `Peer deploy failed (${data.status})`,
      data.status,
    );
  }
  const json = (await data.json().catch(() => ({}))) as { bytes?: number | null };
  return { bytes: typeof json.bytes === "number" ? json.bytes : null };
}

/** Push a .tar.gz already on disk to a specific daemon (streamed via openAsBlob). */
export async function daemonDeployArchiveFileOnNode(
  serverId: string,
  nodeId: string,
  archivePath: string,
): Promise<void> {
  const node = await resolveNode(nodeId);
  const { openAsBlob } = await import("node:fs");
  const form = new FormData();
  form.append(
    "file",
    await openAsBlob(archivePath),
    `${serverId}.tar.gz`,
  );
  const res = await daemonFetch(node, `/servers/${serverId}/deploy`, {
    method: "POST",
    body: form,
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Deploy failed (${res.status})`, res.status);
  }
}

/** Push a local directory tree to the daemon that owns this server (as .tar.gz). */
export async function daemonDeployFromDir(
  serverId: string,
  localDir: string,
): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const execFileAsync = promisify(execFile);
  const { node } = await resolveNodeForServer(serverId);
  const tmp = path.join(
    os.tmpdir(),
    `guartrix-push-${serverId}-${Date.now()}.tar.gz`,
  );
  try {
    await execFileAsync("tar", ["-czf", tmp, "-C", localDir, "."], {
      maxBuffer: 32 * 1024 * 1024,
    });
    const buf = await fs.readFile(tmp);
    const form = new FormData();
    form.append(
      "file",
      new Blob([buf], { type: "application/gzip" }),
      `${serverId}.tar.gz`,
    );
    const res = await daemonFetch(node, `/servers/${serverId}/deploy`, {
      method: "POST",
      body: form,
      timeoutMs: DAEMON_LONG_TIMEOUT_MS,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new DaemonHttpError(text || `Deploy failed (${res.status})`, res.status);
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** Pull server files from a specific daemon node into a .tar.gz on disk. */
export async function daemonExportArchiveToFileOnNode(
  serverId: string,
  nodeId: string,
  destPath: string,
): Promise<void> {
  const node = await resolveNode(nodeId);
  const res = await daemonFetch(node, `/servers/${serverId}/export`, {
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Export failed (${res.status})`, res.status);
  }
  if (!res.body) {
    throw new DaemonHttpError("Empty export body", 502);
  }
  const { pipeline } = await import("node:stream/promises");
  const { createWriteStream } = await import("node:fs");
  const { Readable } = await import("node:stream");
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath));
}

/** Pull server files from the owning daemon into a file on disk (.tar.gz). */
export async function daemonExportArchiveToFile(
  serverId: string,
  destPath: string,
): Promise<void> {
  const { node } = await resolveNodeForServer(serverId);
  await daemonExportArchiveToFileOnNode(serverId, node.id, destPath);
}

/** Prefer daemonExportArchiveToFile for large worlds. */
export async function daemonExportArchive(serverId: string): Promise<Buffer> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = path.join(
    os.tmpdir(),
    `guartrix-export-${serverId}-${Date.now()}.tar.gz`,
  );
  try {
    await daemonExportArchiveToFile(serverId, tmp);
    return await fs.readFile(tmp);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** Stop container + wipe server data on a specific daemon node. */
export async function daemonWipeServerOnNode(
  serverId: string,
  nodeId: string,
): Promise<void> {
  const node = await resolveNode(nodeId);
  const res = await daemonFetch(node, `/servers/${serverId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Wipe failed (${res.status})`, res.status);
  }
}

/** Stop container + wipe server data on the owning daemon. */
export async function daemonWipeServer(serverId: string): Promise<void> {
  const { node } = await resolveNodeForServer(serverId);
  await daemonWipeServerOnNode(serverId, node.id);
}
