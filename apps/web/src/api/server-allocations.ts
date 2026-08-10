import type { PortAllocation } from "@guartrix/shared";
import { request } from "./client";

export const serverAllocationsApi = {
  listAllocations: (id: string) =>
    request<{ allocations: PortAllocation[]; free: PortAllocation[] }>(
      `/api/servers/${id}/allocations`,
    ),
  assignAllocation: (
    id: string,
    body: {
      allocationId?: string;
      port?: number;
      protocol?: "tcp" | "udp";
      notes?: string;
      /** Also create/assign UDP on the same port (query / Geyser). */
      alsoUdp?: boolean;
    },
  ) =>
    request<{ allocation: PortAllocation }>(`/api/servers/${id}/allocations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAllocation: (
    id: string,
    allocId: string,
    body: { notes?: string | null; isPrimary?: boolean; alsoUdp?: boolean },
  ) =>
    request<{ allocation: PortAllocation }>(
      `/api/servers/${id}/allocations/${encodeURIComponent(allocId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteAllocation: (id: string, allocId: string) =>
    request<void>(`/api/servers/${id}/allocations/${encodeURIComponent(allocId)}`, {
      method: "DELETE",
    }),
};
