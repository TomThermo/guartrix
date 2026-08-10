import {
  DAEMON_LONG_TIMEOUT_MS,
  DaemonHttpError,
  daemonFetch,
  daemonJson,
  resolveNode,
} from "./daemon-client-core.js";

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

export async function daemonMysqlRotatePassword(
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
  }>(node, "/mysql/databases/password", {
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

/** Dest node pulls mysqldump from source node (no panel SQL staging). */
export async function daemonMysqlPeerRestoreOnNode(
  fromNodeId: string,
  toNodeId: string,
  name: string,
): Promise<{ bytes: number | null }> {
  const { panelToDaemonAuthorization } = await import("@guartrix/shared/daemon-jwt");
  const { nodePublicUrl } = await import("./nodes.js");
  const from = await resolveNode(fromNodeId);
  const to = await resolveNode(toNodeId);
  const sourceDumpUrl = `${nodePublicUrl(from)}/mysql/databases/dump`;
  const sourceAuthorization = `Bearer ${panelToDaemonAuthorization(from.id, from.token, {
    ttlSec: 30 * 60,
  })}`;
  const res = await daemonFetch(to, "/mysql/databases/restore-from", {
    method: "POST",
    body: JSON.stringify({ sourceDumpUrl, sourceAuthorization, name }),
    timeoutMs: DAEMON_LONG_TIMEOUT_MS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new DaemonHttpError(text || `Peer MySQL restore failed (${res.status})`, res.status);
  }
  const json = (await res.json().catch(() => ({}))) as { bytes?: number | null };
  return { bytes: typeof json.bytes === "number" ? json.bytes : null };
}
