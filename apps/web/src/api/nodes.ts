import type {
  PortAllocation,
} from "@msm/shared";
import { request, notifyUnauthorized } from "./client";

export const nodesApi = {
  listNodes: () =>
    request<{ nodes: import("@msm/shared").DaemonNode[] }>("/api/nodes"),
  listAdminNodes: () =>
    request<{ nodes: import("@msm/shared").DaemonNode[] }>("/api/admin/nodes"),
  createNode: (body: import("@msm/shared").CreateNodeRequest) =>
    request<import("@msm/shared").CreateNodeResponse>("/api/admin/nodes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateNode: (id: string, body: import("@msm/shared").UpdateNodeRequest) =>
    request<{ node: import("@msm/shared").DaemonNode }>(`/api/admin/nodes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteNode: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/nodes/${id}`, { method: "DELETE" }),
  testNode: (id: string) =>
    request<import("@msm/shared").NodeTestResult & { node: import("@msm/shared").DaemonNode }>(
      `/api/admin/nodes/${id}/test`,
      { method: "POST", body: "{}" },
    ),
  regenerateNodeToken: (id: string) =>
    request<import("@msm/shared").CreateNodeResponse>(
      `/api/admin/nodes/${id}/regenerate-token`,
      { method: "POST", body: "{}" },
    ),
  getNodeInstall: (id: string) =>
    request<{
      token: string;
      publicUrl: string;
      envFile: string;
      installCommand: string;
      curlInstall?: string;
      repoUrl?: string;
      steps: string[];
      node: import("@msm/shared").DaemonNode;
    }>(`/api/admin/nodes/${id}/install`),
  remoteInstallNode: async (
    id: string,
    body: {
      sshHost?: string;
      sshPort?: number;
      sshUser: string;
      sshPassword?: string;
      sshPrivateKey?: string;
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
        node?: import("@msm/shared").DaemonNode;
      }) => void;
      signal?: AbortSignal;
    },
  ) => {
    const res = await fetch(`/api/admin/nodes/${id}/remote-install`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    if (!res.ok || !res.body) {
      if (res.status === 401) notifyUnauthorized();
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        stdout?: string;
        stderr?: string;
      };
      const bits = [
        typeof data.error === "string" ? data.error : res.statusText,
        data.stdout,
        data.stderr,
      ].filter(Boolean);
      throw new Error(bits.join("\n\n") || `HTTP ${res.status}`);
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
      node?: import("@msm/shared").DaemonNode;
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
          node?: import("@msm/shared").DaemonNode;
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
        });
      }
    }

    if (!donePayload?.ok) {
      throw new Error(
        donePayload?.error ||
          donePayload?.message ||
          "Remote install failed",
      );
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
};
