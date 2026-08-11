import { daemonJson } from "./daemon-client-core.js";
import { resolveNode } from "./daemon-client-core.js";

export interface DaemonStoragePathStatus {
  path: string;
  exists: boolean;
  mounted: boolean;
  source: string | null;
  fstype: string | null;
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  } | null;
  busyServerIds: string[];
}

export async function daemonStorageStatus(nodeId: string, paths: string[]) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ statuses: DaemonStoragePathStatus[] }>(node, "/storage/status", {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
}

export async function daemonStorageMount(
  nodeId: string,
  body: {
    type: "local" | "nfs";
    mountPoint: string;
    hostPath?: string | null;
    nfsServer?: string | null;
    nfsExport?: string | null;
    nfsOptions?: string | null;
  },
) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean; status: DaemonStoragePathStatus }>(node, "/storage/mount", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function daemonStorageUnmount(
  nodeId: string,
  body: { mountPoint: string; lazy?: boolean; force?: boolean },
) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean; status: DaemonStoragePathStatus }>(node, "/storage/unmount", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function daemonSetServerLocation(
  nodeId: string,
  serverId: string,
  dataRoot: string | null,
) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${encodeURIComponent(serverId)}/location`, {
    method: "PUT",
    body: JSON.stringify({ dataRoot }),
  });
}
