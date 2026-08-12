import type { ApiEndpointDemo } from "./types";
import { SAMPLE_STORAGE_GET, SAMPLE_STORAGES_LIST } from "./samples";

/** Client API with panel admin scopes (`gt_` + `adminScopes`, ADMIN user). */
export const ADMIN_DEMOS: ApiEndpointDemo[] = [
  {
    id: "admin-storages-list",
    group: "Admin API (Client key)",
    title: "List storage pools",
    description:
      "ADMIN session or gt_ key with nodes.read (or admin.full). All global pools with node links, mount status, and live disk stats.",
    method: "GET",
    path: "/api/admin/storages",
    auth: "gt",
    safe: true,
    sampleResponse: SAMPLE_STORAGES_LIST,
  },
  {
    id: "admin-storage-get",
    group: "Admin API (Client key)",
    title: "Get storage pool",
    description: "Single pool by id — same shape as list entries.",
    method: "GET",
    path: "/api/admin/storages/{storageId}",
    auth: "gt",
    safe: true,
    sampleResponse: SAMPLE_STORAGE_GET,
  },
  {
    id: "admin-node-storages",
    group: "Admin API (Client key)",
    title: "Storages for node",
    description: "Pools linked to one node (create-server picker). Scope: nodes.read.",
    method: "GET",
    path: "/api/admin/nodes/{nodeId}/storages",
    auth: "gt",
    safe: true,
    sampleResponse: SAMPLE_STORAGES_LIST,
  },
];
