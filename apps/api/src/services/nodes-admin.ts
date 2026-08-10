import type { FastifyRequest } from "fastify";
import type { AuthUser } from "@guartrix/shared";
import { nanoid } from "nanoid";
import { logActivity } from "../activity-log.js";
import { clearNodeToken, daemonGetStatus, daemonTestNode, setNodeToken } from "../nodes/daemon-client.js";
import {
  generateDaemonToken,
  hashDaemonToken,
  nodePublicUrl,
  removeNodeSftpDns,
  syncNodeSftpDns,
  writeLocalDaemonEnvIfLocal,
} from "../nodes/nodes.js";
import type { createSchema, updateSchema } from "../schemas/nodes.js";
import type { z } from "zod";
import { serializeNodeWithUsage } from "./nodes-list-serialize.js";
import { createNode, deleteNode, findNode, updateNode } from "./nodes.js";

type CreateNodeInput = z.infer<typeof createSchema>;
type UpdateNodeInput = z.infer<typeof updateSchema>;

export async function createAdminNode(
  request: FastifyRequest,
  admin: AuthUser,
  data: CreateNodeInput,
): Promise<{ node: Awaited<ReturnType<typeof serializeNodeWithUsage>>; token: string }> {
  const { assertLicenseNodeQuota } = await import("../license/license.js");
  await assertLicenseNodeQuota();

  const token = generateDaemonToken();
  const sftpPort = Number(process.env.SFTP_PORT ?? 2022) || 2022;
  const location = data.location ?? null;
  const node = await createNode({
    data: {
      id: nanoid(12),
      name: data.name,
      fqdn: data.fqdn,
      scheme: data.scheme,
      daemonPort: data.daemonPort,
      behindProxy: data.behindProxy,
      memoryMb: data.memoryMb,
      location,
      tokenHash: hashDaemonToken(token),
      isLocal: false,
      status: "UNKNOWN",
      sftpPort,
    },
  });
  setNodeToken(node.id, token);
  await syncNodeSftpDns(node.id);
  logActivity({
    action: "node.create",
    request,
    user: admin,
    metadata: {
      node: node.name,
      fqdn: node.fqdn,
      daemonPort: node.daemonPort,
      memoryMb: node.memoryMb,
    },
  });
  return { node: await serializeNodeWithUsage(node.id), token };
}

export async function updateAdminNode(
  request: FastifyRequest,
  admin: AuthUser,
  nodeId: string,
  parsed: UpdateNodeInput,
): Promise<
  | { ok: true; node: Awaited<ReturnType<typeof serializeNodeWithUsage>> }
  | { ok: false; status: number; error: string }
> {
  const existing = await findNode({ where: { id: nodeId } });
  if (!existing) return { ok: false, status: 404, error: "Not found" };

  const data: Record<string, unknown> = { ...parsed };
  if (parsed.location !== undefined) data.location = parsed.location;
  if (parsed.sftpAlias !== undefined) data.sftpAlias = parsed.sftpAlias;
  if (parsed.tags !== undefined) data.tags = parsed.tags;
  if (parsed.daemonBaseDirectory !== undefined) {
    const dir = parsed.daemonBaseDirectory.trim();
    if (!dir.startsWith("/")) {
      return { ok: false, status: 400, error: "Daemon base directory must be an absolute path" };
    }
    data.daemonBaseDirectory = dir.replace(/\/+$/, "") || "/var/lib/guartrix";
  }

  await updateNode({ where: { id: nodeId }, data });
  if (parsed.name || parsed.fqdn || parsed.sftpPort !== undefined) {
    await syncNodeSftpDns(nodeId);
  }
  logActivity({
    action: "node.update",
    request,
    user: admin,
    metadata: { node: existing.name, fields: Object.keys(parsed) },
  });
  return { ok: true, node: await serializeNodeWithUsage(nodeId) };
}

export async function deleteAdminNode(
  request: FastifyRequest,
  admin: AuthUser,
  nodeId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const existing = await findNode({
    where: { id: nodeId },
    include: { _count: { select: { servers: true } } },
  });
  if (!existing) return { ok: false, status: 404, error: "Not found" };
  if (existing.isLocal) return { ok: false, status: 400, error: "Cannot delete the local node" };
  if (existing._count.servers > 0) {
    return { ok: false, status: 400, error: "Node still has servers assigned" };
  }
  await removeNodeSftpDns(nodeId);
  await deleteNode({ where: { id: nodeId } });
  clearNodeToken(nodeId);
  logActivity({
    action: "node.delete",
    request,
    user: admin,
    metadata: { node: existing.name, fqdn: existing.fqdn },
  });
  return { ok: true };
}

export async function getNodeInstallBundle(nodeId: string) {
  const node = await findNode({ where: { id: nodeId } });
  if (!node) return { ok: false as const, status: 404, error: "Not found" };

  const { getNodeToken } = await import("../nodes/daemon-client.js");
  const { defaultRepoUrl, panelPublicBase, buildDaemonInstallScript } = await import(
    "../nodes/remote-install.js"
  );
  const token = getNodeToken(node.id);
  if (!token) {
    return {
      ok: false as const,
      status: 409,
      error: "Daemon token not in vault — regenerate the token, then open install again.",
    };
  }

  const panelUrl = panelPublicBase();
  const repoUrl = defaultRepoUrl();
  const sftpPort = node.sftpPort || 2022;
  const listenPort = node.behindProxy ? 8081 : node.daemonPort;
  const configPath = node.isLocal ? "data/daemon.env" : "/var/lib/guartrix/daemon.env";
  const envBody = [
    `# Guartrix remote daemon — node ${node.name} (${node.id})`,
    `# Save as ${configPath}`,
    `# Panel connect URL: ${nodePublicUrl(node)}`,
    node.behindProxy
      ? `# behindProxy: panel uses HTTPS to the public host; daemon listens on ${listenPort}`
      : `# scheme=${node.scheme}`,
    `DAEMON_TOKEN=${token}`,
    `DAEMON_NODE_ID=${node.id}`,
    `DAEMON_PORT=${listenPort}`,
    `DAEMON_HOST=0.0.0.0`,
    `DATA_DIR=${node.daemonBaseDirectory || "/var/lib/guartrix"}`,
    `PUBLIC_HOST=${node.fqdn}`,
    `PANEL_URL=${panelUrl}`,
    `SFTP_PORT=${sftpPort}`,
    `SFTP_ENABLED=true`,
    `DAEMON_JWT_TTL=900`,
    `DAEMON_JWT_WS_TTL=3600`,
    `DAEMON_JWT_LEGACY=false`,
    `DOCKER_IMAGE=${process.env.DOCKER_IMAGE ?? "eclipse-temurin:25-jre-jammy"}`,
    `DOCKER_NETWORK_MODE=${(process.env.DOCKER_NETWORK_MODE ?? "per_server").trim() || "per_server"}`,
    `MANAGE_FIREWALL=true`,
    "",
  ].join("\n");
  const curlInstall = buildDaemonInstallScript({
    token,
    nodeId: node.id,
    fqdn: node.fqdn,
    daemonPort: listenPort,
    panelUrl,
    sftpPort,
    repoUrl: undefined,
  });
  const installCommand = `sudo bash -c ${JSON.stringify(curlInstall)}`;

  return {
    ok: true as const,
    node: await serializeNodeWithUsage(node.id),
    token,
    publicUrl: nodePublicUrl(node),
    envFile: envBody,
    configPath,
    listenPort,
    installCommand,
    autoDeployCommand: installCommand,
    curlInstall,
    repoUrl,
    bundleUrl: `${panelUrl}/install-daemon-bundle.zip`,
    sshHostKeyFingerprint: node.sshHostKeyFingerprint ?? null,
    steps: [
      "Easiest: fill in SSH details below and click “Install via SSH” (panel connects and installs).",
      "First SSH: confirm the host-key fingerprint, then trust it (stored on the node).",
      "Or SSH to the VPS yourself and run the install command (downloads a prebuilt daemon zip — no TypeScript compile).",
      `Manual: copy daemon.env to ${configPath} on the node, then start the daemon.`,
      `Firewall: daemon ${listenPort}/tcp is restricted to the panel host when possible; keep ${sftpPort}/tcp + game ports open.`,
      "Click “Test connection” in the panel.",
    ],
  };
}

export async function getNodeLiveStatus(nodeId: string) {
  const existing = await findNode({ where: { id: nodeId } });
  if (!existing) return { ok: false as const, status: 404, error: "Not found" };

  const publicUrl = nodePublicUrl(existing);
  try {
    const snapshot = await daemonGetStatus(existing.id);
    await updateNode({
      where: { id: existing.id },
      data: { status: "ONLINE", lastSeenAt: new Date(), memoryMb: snapshot.totalMemoryMb },
    });
    return {
      ok: true as const,
      body: {
        id: existing.id,
        name: existing.name,
        isLocal: existing.isLocal,
        publicUrl,
        reachable: true as const,
        daemon: {
          hostname: snapshot.hostname,
          publicIp: snapshot.publicIp,
          localIps: snapshot.localIps,
          osVersion: snapshot.osVersion,
          arch: snapshot.arch,
          cpuCount: snapshot.cpuCount,
          loadAvg: snapshot.loadAvg,
          dockerVersion: snapshot.dockerVersion,
          daemonVersion: snapshot.daemonVersion,
          daemonPid: snapshot.daemonPid,
          daemonPort: snapshot.daemonPort,
          daemonMemoryRssMb: snapshot.daemonMemoryRssMb,
          uptime: snapshot.uptime,
          totalMemoryMb: snapshot.totalMemoryMb,
          totalMemoryGb: snapshot.totalMemoryGb,
          freeMemoryMb: snapshot.freeMemoryMb,
          disk: snapshot.disk,
          network: snapshot.network ?? null,
        },
        mysql: snapshot.mysql,
        sftp: {
          listening: Boolean(snapshot.sftp?.listening),
          port: snapshot.sftp?.port ?? existing.sftpPort ?? 2022,
          hostname: existing.sftpHostname ?? null,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    await updateNode({ where: { id: existing.id }, data: { status: "OFFLINE" } });
    return {
      ok: true as const,
      body: {
        id: existing.id,
        name: existing.name,
        isLocal: existing.isLocal,
        publicUrl,
        reachable: false as const,
        error: err instanceof Error ? err.message : String(err),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export async function testAdminNode(nodeId: string) {
  const existing = await findNode({ where: { id: nodeId } });
  if (!existing) return { ok: false as const, status: 404, error: "Not found" };
  const result = await daemonTestNode(nodeId);
  if (result.ok) await syncNodeSftpDns(nodeId, result.system.publicIp);
  return { ok: true as const, result, node: await serializeNodeWithUsage(nodeId) };
}

export async function regenerateAdminNodeToken(
  request: FastifyRequest,
  admin: AuthUser,
  nodeId: string,
) {
  const existing = await findNode({ where: { id: nodeId } });
  if (!existing) return { ok: false as const, status: 404, error: "Not found" };
  const token = generateDaemonToken();
  const node = await updateNode({
    where: { id: existing.id },
    data: { tokenHash: hashDaemonToken(token) },
  });
  setNodeToken(node.id, token);
  if (node.isLocal) writeLocalDaemonEnvIfLocal(token, node.daemonPort, node.id);
  logActivity({
    action: "node.token-rotate",
    request,
    user: admin,
    metadata: { node: node.name },
  });
  return { ok: true as const, node: await serializeNodeWithUsage(node.id), token };
}

export type RemoteInstallInput = {
  sshHost?: string;
  sshPort: number;
  sshUser: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  trustHostKey: boolean;
  replaceHostKey: boolean;
  expectedHostKeyFingerprint?: string;
};

export async function runAdminNodeRemoteInstall(
  request: FastifyRequest,
  admin: AuthUser,
  nodeId: string,
  input: RemoteInstallInput,
  onChunk?: (chunk: unknown) => void,
) {
  const node = await findNode({ where: { id: nodeId } });
  if (!node) return { ok: false as const, status: 404, error: "Not found" };
  if (node.isLocal) {
    return { ok: false as const, status: 400, error: "Local node is managed by the panel host" };
  }

  const { getNodeToken } = await import("../nodes/daemon-client.js");
  const { defaultRepoUrl, panelPublicBase, buildDaemonInstallScript, runRemoteDaemonInstall } =
    await import("../nodes/remote-install.js");
  const token = getNodeToken(node.id);
  if (!token) {
    return {
      ok: false as const,
      status: 409,
      error: "Daemon token not in vault — regenerate token first.",
    };
  }

  const panelUrl = panelPublicBase();
  const installScript = buildDaemonInstallScript({
    token,
    nodeId: node.id,
    fqdn: node.fqdn,
    daemonPort: node.daemonPort,
    panelUrl,
    sftpPort: node.sftpPort || 2022,
    repoUrl: defaultRepoUrl(),
  });

  const persistTrustedKey = async (fp: string | undefined) => {
    if (!fp || node.sshHostKeyFingerprint === fp) return;
    await updateNode({ where: { id: node.id }, data: { sshHostKeyFingerprint: fp } });
    node.sshHostKeyFingerprint = fp;
    logActivity({
      action: "node.ssh_host_key_trusted",
      request,
      user: admin,
      metadata: { nodeId: node.id, fingerprint: fp },
    });
  };

  const result = await runRemoteDaemonInstall({
    sshHost: input.sshHost?.trim() || node.fqdn,
    sshPort: input.sshPort,
    sshUser: input.sshUser,
    sshPassword: input.sshPassword,
    sshPrivateKey: input.sshPrivateKey,
    knownHostKeyFingerprint: node.sshHostKeyFingerprint,
    expectedHostKeyFingerprint: input.expectedHostKeyFingerprint,
    trustHostKey: input.trustHostKey,
    replaceHostKey: input.replaceHostKey,
    installScript,
    onChunk,
  });

  if (result.trustedHostKeyFingerprint) {
    await persistTrustedKey(result.trustedHostKeyFingerprint);
  }

  let test: unknown = null;
  if (result.ok) {
    try {
      test = await daemonTestNode(node.id);
    } catch {
      // ignore
    }
  }

  return {
    ok: result.ok,
    status: result.ok ? 200 : result.hostKeyNeedsTrust || result.hostKeyMismatch ? 409 : 502,
    payload: {
      ok: result.ok,
      message: result.ok ? "Daemon installed on the remote VPS" : result.error || "Remote install failed",
      error: result.error,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      hostKeyFingerprint: result.hostKeyFingerprint,
      hostKeyMismatch: result.hostKeyMismatch,
      hostKeyNeedsTrust: result.hostKeyNeedsTrust,
      test,
      node: await serializeNodeWithUsage(node.id).catch(() => undefined),
    },
  };
}
