import type { DaemonServerConfig } from "@msm/node-agent";
import type { ServerStatus } from "@msm/shared";
import {
  daemonJwtWsTtlSec,
  panelToDaemonAuthorization,
} from "@msm/shared/daemon-jwt";
import { nodePublicUrl } from "./nodes.js";
import { prisma } from "../db.js";
import {
  loadNodeTokenVault,
  saveNodeTokenVault,
} from "./node-token-vault.js";

export class DaemonHttpError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "DaemonHttpError";
  }
}

type NodeRow = {
  id: string;
  fqdn: string;
  scheme: string;
  daemonPort: number;
  tokenHash: string;
};

/** Plaintext tokens keyed by node id (memory + encrypted data/node-tokens.json). */
const tokenByNodeId = new Map<string, string>();

function persistVault(): void {
  const out: Record<string, string> = {};
  for (const [id, token] of tokenByNodeId) {
    out[id] = token;
  }
  try {
    saveNodeTokenVault(out);
  } catch (err) {
    console.error(
      "[guartrix] Failed to persist node token vault:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Store plaintext token in memory and encrypted vault (multi-node per-node secret). */
export function setNodeToken(nodeId: string, token: string): void {
  tokenByNodeId.set(nodeId, token);
  persistVault();
}

export function clearNodeToken(nodeId: string): void {
  if (!tokenByNodeId.delete(nodeId)) return;
  persistVault();
}

export function getNodeToken(nodeId: string): string | undefined {
  return tokenByNodeId.get(nodeId);
}

/** Hydrate in-memory tokens from the encrypted vault (call once on API boot). */
export function loadPersistedNodeTokens(): number {
  const vault = loadNodeTokenVault();
  let n = 0;
  for (const [id, token] of Object.entries(vault)) {
    if (tokenByNodeId.has(id)) continue;
    tokenByNodeId.set(id, token);
    n += 1;
  }
  return n;
}

async function resolveNode(nodeId?: string | null): Promise<NodeRow & { token: string }> {
  const node = nodeId
    ? await prisma.node.findUnique({ where: { id: nodeId } })
    : await prisma.node.findFirst({ where: { isLocal: true } });
  if (!node) {
    throw new DaemonHttpError("No daemon node configured", 503);
  }
  const token = tokenByNodeId.get(node.id);
  if (!token) {
    throw new DaemonHttpError(
      `Daemon token missing for node ${node.name} — restart panel or regenerate token`,
      503,
    );
  }
  return { ...node, token };
}

export async function resolveNodeForServer(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });
  if (!server) throw new DaemonHttpError("Server not found", 404);
  let node = server.node;
  if (!node) {
    node = await prisma.node.findFirst({ where: { isLocal: true } });
    if (node) {
      await prisma.server.update({
        where: { id: serverId },
        data: { nodeId: node.id },
      });
    }
  }
  if (!node) throw new DaemonHttpError("No daemon node for server", 503);
  const token = tokenByNodeId.get(node.id);
  if (!token) {
    throw new DaemonHttpError(
      `Daemon token missing for node ${node.name}`,
      503,
    );
  }
  return { server, node: { ...node, token } };
}

function baseUrl(node: { scheme: string; fqdn: string; daemonPort: number }): string {
  return nodePublicUrl(node);
}

const DAEMON_DEFAULT_TIMEOUT_MS = 5_000;
/** Transfer / backup / deploy streams can take a long time. */
const DAEMON_LONG_TIMEOUT_MS = 30 * 60 * 1000;
/** Start/restart may pull images and wait for game boot. */
const DAEMON_POWER_TIMEOUT_MS = 180_000;

async function daemonFetch(
  node: NodeRow & { token: string },
  path: string,
  init?: RequestInit & { raw?: boolean; timeoutMs?: number },
): Promise<Response> {
  const url = `${baseUrl(node)}${path}`;
  const headers = new Headers(init?.headers);
  headers.set(
    "Authorization",
    `Bearer ${panelToDaemonAuthorization(node.id, node.token)}`,
  );
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const { timeoutMs, raw: _raw, ...rest } = init ?? {};
  const timeout = timeoutMs ?? DAEMON_DEFAULT_TIMEOUT_MS;
  const signal =
    rest.signal ??
    (timeout > 0 ? AbortSignal.timeout(timeout) : undefined);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers, signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DaemonHttpError(`Daemon unreachable (${node.fqdn}): ${message}`, 503);
  }
  return res;
}

/** Bearer for daemon WebSocket (longer-lived JWT). */
export function daemonWsAuthorization(nodeId: string, secret: string): string {
  return panelToDaemonAuthorization(nodeId, secret, {
    ttlSec: daemonJwtWsTtlSec(),
  });
}

async function daemonJson<T>(
  node: NodeRow & { token: string },
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const res = await daemonFetch(node, path, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!res.ok) {
    const err =
      body && typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Daemon error ${res.status}`;
    throw new DaemonHttpError(err, res.status);
  }
  return body as T;
}

export async function daemonGetSystem(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<{
    totalMemoryMb: number;
    totalMemoryGb: number;
    hostname: string;
    publicIp: string | null;
    version: string;
    uptime: number;
    daemonVersion: string;
  }>(node, "/system");
}

export interface DaemonStatusSnapshot {
  hostname: string;
  publicIp: string | null;
  localIps: Array<{ iface: string; address: string }>;
  osVersion: string;
  arch: string;
  cpuCount: number;
  loadAvg: [number, number, number];
  dockerVersion: string;
  daemonVersion: string;
  daemonPid: number;
  daemonPort: number;
  daemonMemoryRssMb: number;
  uptime: number;
  totalMemoryMb: number;
  totalMemoryGb: number;
  freeMemoryMb: number;
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
    totalLabel: string;
    usedLabel: string;
    freeLabel: string;
  } | null;
  mysql: {
    running: boolean;
    container: string;
    image: string;
    host: string;
    port: number;
  } | null;
  sftp?: {
    port: number;
    listening: boolean;
  } | null;
  containers: Array<{
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    createdAt: string;
    ports: string;
    serverId: string | null;
    isMysql: boolean;
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryLimitBytes: number;
    memoryPercent: number;
    memoryUsedLabel: string;
    memoryLimitLabel: string;
  }>;
}

export async function daemonGetStatus(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<DaemonStatusSnapshot>(node, "/status");
}

export async function daemonTestNode(nodeId: string) {
  const node = await resolveNode(nodeId);
  try {
    const system = await daemonJson<{
      totalMemoryMb: number;
      totalMemoryGb: number;
      hostname: string;
      publicIp: string | null;
      uptime: number;
      daemonVersion: string;
    }>(node, "/system");
    await prisma.node.update({
      where: { id: nodeId },
      data: {
        status: "ONLINE",
        lastSeenAt: new Date(),
        memoryMb: system.totalMemoryMb,
      },
    });
    return { ok: true as const, system };
  } catch (err) {
    await prisma.node.update({
      where: { id: nodeId },
      data: { status: "OFFLINE" },
    });
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function daemonCleanupContainers(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean; removed: number }>(node, "/cleanup-containers", {
    method: "POST",
    body: "{}",
  });
}

export async function daemonPower(
  serverId: string,
  action: "start" | "stop" | "restart" | "kill",
  server?: DaemonServerConfig,
) {
  const { node } = await resolveNodeForServer(serverId);
  const timeoutMs =
    action === "start" || action === "restart"
      ? DAEMON_POWER_TIMEOUT_MS
      : DAEMON_DEFAULT_TIMEOUT_MS;
  return daemonJson<{ ok: boolean; status?: ServerStatus }>(
    node,
    `/servers/${serverId}/power`,
    {
      method: "POST",
      body: JSON.stringify({ action, server }),
      timeoutMs,
    },
  );
}

/** Push panel license ticket to a node (or all known nodes when nodeId omitted). */
export async function daemonPushLicenseTicket(
  ticket: unknown,
  nodeId?: string | null,
): Promise<{ ok: boolean; mode?: string }> {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean; mode?: string }>(node, "/license/ticket", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
}

/** Best-effort push to every node that has a vault token. */
export async function daemonPushLicenseTicketAll(
  ticket: unknown,
): Promise<{ pushed: number; failed: number }> {
  const nodes = await prisma.node.findMany({ select: { id: true } });
  let pushed = 0;
  let failed = 0;
  for (const n of nodes) {
    if (!tokenByNodeId.has(n.id)) {
      failed += 1;
      continue;
    }
    try {
      await daemonPushLicenseTicket(ticket, n.id);
      pushed += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[license] ticket push failed for node ${n.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { pushed, failed };
}

export async function daemonSetLimits(
  serverId: string,
  limits: { diskMb: number; cpuLimit: number },
) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${serverId}/limits`, {
    method: "PUT",
    body: JSON.stringify(limits),
  });
}

export async function daemonCommand(serverId: string, command: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${serverId}/command`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export async function daemonIsRunning(serverId: string): Promise<boolean> {
  const { node } = await resolveNodeForServer(serverId);
  const data = await daemonJson<{ running: boolean }>(
    node,
    `/servers/${serverId}/running`,
  );
  return data.running;
}

export async function daemonIsPortFree(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
) {
  const node = await resolveNode(nodeId);
  const data = await daemonJson<{ free: boolean }>(node, "/ports/check", {
    method: "POST",
    body: JSON.stringify({ port, protocol }),
  });
  return data.free;
}

export async function daemonChown(serverId: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${serverId}/chown`, {
    method: "POST",
    body: "{}",
  });
}

export async function daemonStats(serverId: string, includeDisk = false) {
  const { node } = await resolveNodeForServer(serverId);
  const q = includeDisk ? "?disk=1" : "";
  return daemonJson(node, `/servers/${serverId}/stats${q}`);
}

export async function daemonDisk(serverId: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, `/servers/${serverId}/disk`);
}

export async function daemonOnlineNames(serverId: string): Promise<string[]> {
  const { node } = await resolveNodeForServer(serverId);
  const data = await daemonJson<{ online: string[] }>(
    node,
    `/servers/${serverId}/players`,
  );
  return data.online;
}

export async function daemonHistory(serverId: string): Promise<string[]> {
  const { node } = await resolveNodeForServer(serverId);
  const data = await daemonJson<{ lines: string[] }>(
    node,
    `/servers/${serverId}/history`,
  );
  return data.lines;
}

export async function daemonFirewallOpen(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
) {
  const node = await resolveNode(nodeId);
  return daemonJson(node, "/firewall/open", {
    method: "POST",
    body: JSON.stringify({ port, protocol }),
  });
}

export async function daemonFirewallClose(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
) {
  const node = await resolveNode(nodeId);
  return daemonJson(node, "/firewall/close", {
    method: "POST",
    body: JSON.stringify({ port, protocol }),
  });
}

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

export async function daemonWriteFile(
  serverId: string,
  relPath: string,
  content: string,
) {
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

export async function daemonDownloadFile(
  serverId: string,
  relPath: string,
): Promise<Response> {
  const { node } = await resolveNodeForServer(serverId);
  const q = new URLSearchParams({ path: relPath });
  const res = await daemonFetch(
    node,
    `/servers/${serverId}/files/download?${q}`,
    { timeoutMs: DAEMON_LONG_TIMEOUT_MS },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Daemon error ${res.status}`, res.status);
  }
  return res;
}

export async function daemonCompressFiles(
  serverId: string,
  paths: string[],
  destination: string,
) {
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

export async function daemonDownloadZip(
  serverId: string,
  paths: string[],
): Promise<Response> {
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
  return daemonJson<{ ok: boolean; path: string }>(
    node,
    `/servers/${serverId}/files/decompress`,
    {
      method: "POST",
      body: JSON.stringify({
        path: archivePath,
        ...(destination ? { destination } : {}),
      }),
    },
  );
}

export async function daemonMysqlStatus(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<{
    running: boolean;
    container: string;
    image: string;
    host: string;
    port: number;
  }>(node, "/mysql/status");
}

export async function daemonMysqlEnsure(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<{
    ok: boolean;
    mysql: {
      running: boolean;
      container: string;
      image: string;
      host: string;
      port: number;
    };
  }>(node, "/mysql/ensure", { method: "POST", body: "{}" });
}

export async function daemonMysqlCreate(
  nodeId: string,
  input: {
    name: string;
    username: string;
    password: string;
    remote?: string;
  },
) {
  const node = await resolveNode(nodeId);
  return daemonJson<{
    ok: boolean;
    database: {
      name: string;
      username: string;
      password: string;
      host: string;
      port: number;
      remote: string;
    };
  }>(node, "/mysql/databases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function daemonMysqlDelete(
  nodeId: string,
  input: { name: string; username: string; remote?: string },
) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean }>(node, "/mysql/databases/delete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function daemonMysqlDumpToFile(
  nodeId: string,
  name: string,
  destPath: string,
): Promise<void> {
  const node = await resolveNode(nodeId);
  const res = await daemonFetch(node, "/mysql/databases/dump", {
    method: "POST",
    body: JSON.stringify({ name }),
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Daemon error ${res.status}`, res.status);
  }
  const fs = await import("node:fs/promises");
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir((await import("node:path")).dirname(destPath), {
    recursive: true,
  });
  await fs.writeFile(destPath, buf);
}

export async function daemonMysqlRestoreFromFile(
  nodeId: string,
  name: string,
  sqlPath: string,
): Promise<void> {
  const node = await resolveNode(nodeId);
  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(sqlPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), `${name}.sql`);
  const q = new URLSearchParams({ name });
  const res = await daemonFetch(node, `/mysql/databases/restore?${q}`, {
    method: "POST",
    body: form,
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Daemon error ${res.status}`, res.status);
  }
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

export async function daemonOpenFirewallForGamePort(serverId: string, port: number) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, "/firewall/open", {
    method: "POST",
    body: JSON.stringify({ port }),
  });
}

export function daemonWsUrl(
  node: { scheme: string; fqdn: string; daemonPort: number },
  path: string,
): string {
  const http = nodePublicUrl(node);
  const ws = http.replace(/^http/, "ws");
  return `${ws}${path}`;
}

export { daemonFetch, baseUrl };
