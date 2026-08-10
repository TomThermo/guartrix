import { daemonJwtWsTtlSec, panelToDaemonAuthorization } from "@guartrix/shared/daemon-jwt";
import { nodePublicUrl } from "./nodes.js";
import { prisma } from "../db.js";
import { loadNodeTokenVault, saveNodeTokenVault } from "./node-token-vault.js";

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

export async function resolveNode(nodeId?: string | null): Promise<NodeRow & { token: string }> {
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
    throw new DaemonHttpError(`Daemon token missing for node ${node.name}`, 503);
  }
  return { server, node: { ...node, token } };
}

function baseUrl(node: { scheme: string; fqdn: string; daemonPort: number }): string {
  return nodePublicUrl(node);
}

export const DAEMON_DEFAULT_TIMEOUT_MS = 5_000;
/** Transfer / backup / deploy streams can take a long time. */
export const DAEMON_LONG_TIMEOUT_MS = 30 * 60 * 1000;
/** Start/restart may pull images and wait for game boot. */
export const DAEMON_POWER_TIMEOUT_MS = 180_000;

async function daemonFetch(
  node: NodeRow & { token: string },
  path: string,
  init?: RequestInit & { raw?: boolean; timeoutMs?: number },
): Promise<Response> {
  const url = `${baseUrl(node)}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${panelToDaemonAuthorization(node.id, node.token)}`);
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const { timeoutMs, raw: _raw, ...rest } = init ?? {};
  const timeout = timeoutMs ?? DAEMON_DEFAULT_TIMEOUT_MS;
  const signal = rest.signal ?? (timeout > 0 ? AbortSignal.timeout(timeout) : undefined);
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

export async function daemonJson<T>(
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

export function daemonWsUrl(
  node: { scheme: string; fqdn: string; daemonPort: number },
  path: string,
): string {
  const http = nodePublicUrl(node);
  const ws = http.replace(/^http/, "ws");
  return `${ws}${path}`;
}

export { daemonFetch, baseUrl };
