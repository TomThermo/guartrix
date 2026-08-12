import type { PortAllocation } from "@guartrix/shared";
import { request, notifyUnauthorized, withCsrfHeaders, refreshCsrfToken } from "./client";

export const nodesApi = {
  listNodes: () => request<{ nodes: import("@guartrix/shared").DaemonNode[] }>("/api/nodes"),
  suggestedPort: (nodeId: string, type: import("@guartrix/shared").ServerType) =>
    request<{ port: number; protocol: "tcp" | "udp" }>(
      `/api/nodes/${encodeURIComponent(nodeId)}/suggested-port?type=${encodeURIComponent(type)}`,
    ),
  checkNodePort: (nodeId: string, port: number, type: import("@guartrix/shared").ServerType) =>
    request<{ free: boolean; port: number; protocol: "tcp" | "udp" }>(
      `/api/nodes/${encodeURIComponent(nodeId)}/port-check?port=${port}&type=${encodeURIComponent(type)}`,
    ),
  listAdminNodes: () => request<{ nodes: import("@guartrix/shared").DaemonNode[] }>("/api/admin/nodes"),
  lookupDns: (host: string) =>
    request<{
      host: string;
      ok: boolean;
      addresses: string[];
      kind: "ip" | "dns";
      panelSecure: boolean;
      error?: string;
    }>(`/api/admin/dns-lookup?host=${encodeURIComponent(host)}`),
  createNode: (body: import("@guartrix/shared").CreateNodeRequest) =>
    request<import("@guartrix/shared").CreateNodeResponse>("/api/admin/nodes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNode: (id: string, body: import("@guartrix/shared").UpdateNodeRequest) =>
    request<{ node: import("@guartrix/shared").DaemonNode }>(`/api/admin/nodes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNode: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/nodes/${id}`, { method: "DELETE" }),
  getAdminNodeStatus: (id: string) =>
    request<import("@guartrix/shared").AdminNodeStatusResponse>(
      `/api/admin/nodes/${encodeURIComponent(id)}/status`,
    ),
  testNode: (id: string) =>
    request<import("@guartrix/shared").NodeTestResult & { node: import("@guartrix/shared").DaemonNode }>(
      `/api/admin/nodes/${id}/test`,
      { method: "POST", body: "{}" },
    ),
  regenerateNodeToken: (id: string) =>
    request<import("@guartrix/shared").CreateNodeResponse>(`/api/admin/nodes/${id}/regenerate-token`, {
      method: "POST",
      body: "{}",
    }),
  getNodeInstall: (id: string) =>
    request<{
      token: string;
      publicUrl: string;
      envFile: string;
      configPath?: string;
      listenPort?: number;
      installCommand: string;
      autoDeployCommand?: string;
      curlInstall?: string;
      repoUrl?: string;
      steps: string[];
      sshHostKeyFingerprint?: string | null;
      node: import("@guartrix/shared").DaemonNode;
    }>(`/api/admin/nodes/${id}/install`),
  remoteInstallNode: async (
    id: string,
    body: {
      sshHost?: string;
      sshPort?: number;
      sshUser: string;
      sshPassword?: string;
      sshPrivateKey?: string;
      panelPassword: string;
      trustHostKey?: boolean;
      replaceHostKey?: boolean;
      expectedHostKeyFingerprint?: string;
    },
    opts?: {
      onChunk?: (chunk: {
        type: "status" | "stdout" | "stderr" | "done";
        message?: string;
        data?: string;
        ok?: boolean;
        error?: string;
        exitCode?: number | null;
        stdout?: string;
        stderr?: string;
        test?: unknown;
        node?: import("@guartrix/shared").DaemonNode;
        hostKeyFingerprint?: string;
        hostKeyMismatch?: boolean;
        hostKeyNeedsTrust?: boolean;
      }) => void;
      signal?: AbortSignal;
    },
  ) => {
    const post = async (csrfRetried: boolean): Promise<Response> => {
      const res = await fetch(`/api/admin/nodes/${id}/remote-install`, {
        method: "POST",
        credentials: "include",
        headers: withCsrfHeaders({
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        }),
        body: JSON.stringify(body),
        signal: opts?.signal,
      });
      if (
        !res.ok &&
        res.status === 403 &&
        !csrfRetried &&
        (res.headers.get("content-type") || "").includes("application/json")
      ) {
        const data = (await res.clone().json().catch(() => ({}))) as { error?: string };
        if (typeof data.error === "string" && /csrf token/i.test(data.error)) {
          if (await refreshCsrfToken()) return post(true);
        }
      }
      return res;
    };

    const res = await post(false);
    if (!res.ok || !res.body) {
      if (res.status === 401) notifyUnauthorized();
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        stdout?: string;
        stderr?: string;
        hostKeyFingerprint?: string;
        hostKeyMismatch?: boolean;
        hostKeyNeedsTrust?: boolean;
      };
      const bits = [
        typeof data.error === "string" ? data.error : res.statusText,
        data.stdout,
        data.stderr,
      ].filter(Boolean);
      const err = new Error(bits.join("\n\n") || `HTTP ${res.status}`) as Error & {
        hostKeyFingerprint?: string;
        hostKeyMismatch?: boolean;
        hostKeyNeedsTrust?: boolean;
      };
      err.hostKeyFingerprint = data.hostKeyFingerprint;
      err.hostKeyMismatch = data.hostKeyMismatch;
      err.hostKeyNeedsTrust = data.hostKeyNeedsTrust;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: {
      ok?: boolean;
      message?: string;
      error?: string;
      exitCode?: number | null;
      stdout?: string;
      stderr?: string;
      test?: unknown;
      node?: import("@guartrix/shared").DaemonNode;
      hostKeyFingerprint?: string;
      hostKeyMismatch?: boolean;
      hostKeyNeedsTrust?: boolean;
    } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk: {
          type?: string;
          message?: string;
          data?: string;
          ok?: boolean;
          error?: string;
          exitCode?: number | null;
          stdout?: string;
          stderr?: string;
          test?: unknown;
          node?: import("@guartrix/shared").DaemonNode;
          hostKeyFingerprint?: string;
          hostKeyMismatch?: boolean;
          hostKeyNeedsTrust?: boolean;
        };
        try {
          chunk = JSON.parse(trimmed) as typeof chunk;
        } catch {
          continue;
        }
        if (chunk.type === "done") {
          donePayload = chunk;
        }
        opts?.onChunk?.({
          type: (chunk.type as "status" | "stdout" | "stderr" | "done") || "status",
          message: chunk.message,
          data: chunk.data,
          ok: chunk.ok,
          error: chunk.error,
          exitCode: chunk.exitCode,
          stdout: chunk.stdout,
          stderr: chunk.stderr,
          test: chunk.test,
          node: chunk.node,
          hostKeyFingerprint: chunk.hostKeyFingerprint,
          hostKeyMismatch: chunk.hostKeyMismatch,
          hostKeyNeedsTrust: chunk.hostKeyNeedsTrust,
        });
      }
    }

    if (!donePayload?.ok) {
      const err = new Error(
        donePayload?.error || donePayload?.message || "Remote install failed",
      ) as Error & {
        hostKeyFingerprint?: string;
        hostKeyMismatch?: boolean;
        hostKeyNeedsTrust?: boolean;
      };
      err.hostKeyFingerprint = donePayload?.hostKeyFingerprint;
      err.hostKeyMismatch = donePayload?.hostKeyMismatch;
      err.hostKeyNeedsTrust = donePayload?.hostKeyNeedsTrust;
      throw err;
    }
    return donePayload;
  },
  adminListNodeAllocations: (nodeId: string) =>
    request<{
      allocations: PortAllocation[];
      assigned: number;
      free: number;
    }>(`/api/admin/nodes/${encodeURIComponent(nodeId)}/allocations`),
  adminCreateNodeAllocations: (
    nodeId: string,
    body: {
      portStart: number;
      portEnd?: number;
      protocol?: "tcp" | "udp";
      ip?: string;
      notes?: string;
    },
  ) =>
    request<{
      created: number;
      skipped: number;
      allocations: PortAllocation[];
    }>(`/api/admin/nodes/${encodeURIComponent(nodeId)}/allocations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminDeleteNodeAllocation: (nodeId: string, allocId: string) =>
    request<void>(
      `/api/admin/nodes/${encodeURIComponent(nodeId)}/allocations/${encodeURIComponent(allocId)}`,
      { method: "DELETE" },
    ),
  adminListNodeStorages: (nodeId: string) =>
    request<{ storages: unknown[] }>(
      `/api/admin/nodes/${encodeURIComponent(nodeId)}/storages`,
    ),
  adminListStorages: () => request<{ storages: unknown[] }>("/api/admin/storages"),
  adminGetStorage: (id: string) =>
    request<{ storage: unknown }>(`/api/admin/storages/${encodeURIComponent(id)}`),
  adminCreateStorage: (body: {
    name: string;
    type: "LOCAL" | "NFS";
    nfsServer?: string | null;
    nfsExport?: string | null;
    nfsOptions?: string | null;
    diskMb?: number;
    enabled?: boolean;
    nodeId?: string;
    mountPoint?: string;
    hostPath?: string | null;
  }) =>
    request<{ storage: unknown }>("/api/admin/storages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdateStorage: (
    id: string,
    body: {
      name?: string;
      nfsServer?: string | null;
      nfsExport?: string | null;
      nfsOptions?: string | null;
      diskMb?: number;
      enabled?: boolean;
    },
  ) =>
    request<{ storage: unknown }>(`/api/admin/storages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminDeleteStorage: (id: string, force?: boolean) =>
    request<{ ok: boolean }>(
      `/api/admin/storages/${encodeURIComponent(id)}${force ? "?force=1" : ""}`,
      { method: "DELETE" },
    ),
  adminLinkStorageNode: (
    id: string,
    body: { nodeId: string; mountPoint?: string; hostPath?: string | null },
  ) =>
    request<{ storage: unknown }>(`/api/admin/storages/${encodeURIComponent(id)}/nodes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUnlinkStorageNode: (id: string, nodeId: string) =>
    request<{ storage: unknown }>(
      `/api/admin/storages/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}`,
      { method: "DELETE" },
    ),
  adminMountStorageNode: (id: string, nodeId: string) =>
    request<{ storage: unknown }>(
      `/api/admin/storages/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}/mount`,
      { method: "POST", body: "{}" },
    ),
  adminUnmountStorageNode: (
    id: string,
    nodeId: string,
    body?: { force?: boolean; lazy?: boolean },
  ) =>
    request<{ storage: unknown }>(
      `/api/admin/storages/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}/unmount`,
      { method: "POST", body: JSON.stringify(body ?? {}) },
    ),
};
