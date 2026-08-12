/**
 * Barrel re-export for node domain helpers.
 * Implementation lives in nodes-*.ts modules.
 */

export {
  hashDaemonToken,
  generateDaemonToken,
  findNodeByDaemonToken,
} from "./nodes-token.js";

export {
  nodePublicUrl,
  parseNodeTags,
  nodeAllocationBudget,
  nodeSftpDisplayHost,
  nodeMemoryReserveMb,
} from "./nodes-helpers.js";

export { serializeNode, resolveNodePublicIpv4 } from "./nodes-serialize.js";

export { syncNodeSftpDns, removeNodeSftpDns } from "./nodes-dns.js";

export { listNodesWithUsage, assertNodeCapacity } from "./nodes-capacity.js";

export { resolveCreatePlacement } from "./nodes-placement.js";
export type { CreatePlacementInput, CreatePlacementResult } from "./nodes-placement.js";

export {
  resolveCreateNodeId,
  writeLocalDaemonEnvIfLocal,
  ensureLocalNode,
  getLocalDaemonToken,
  getNodeForServer,
} from "./nodes-local.js";
