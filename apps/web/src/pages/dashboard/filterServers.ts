import type { McServer } from "@guartrix/shared";
import type { StatusFilter } from "./types";

export function statusLabelFor(status: McServer["status"], t: (key: string) => string): string {
  switch (status) {
    case "RUNNING":
      return t("dashboard.online");
    case "STARTING":
      return "Starting";
    case "STOPPING":
      return "Stopping";
    case "CREATING":
      return "Creating";
    case "TRANSFERRING":
      return "Moving";
    case "ERROR":
      return t("dashboard.error");
    default:
      return t("dashboard.offline");
  }
}

export function filterServers(
  servers: McServer[],
  query: string,
  statusFilter: StatusFilter,
  nodeFilter: string,
  typeFilter: string,
): McServer[] {
  const q = query.trim().toLowerCase();
  return servers.filter((s) => {
    if (statusFilter === "online" && s.status !== "RUNNING") return false;
    if (statusFilter === "offline" && s.status !== "STOPPED") return false;
    if (
      statusFilter === "busy" &&
      s.status !== "STARTING" &&
      s.status !== "STOPPING" &&
      s.status !== "CREATING" &&
      s.status !== "TRANSFERRING"
    ) {
      return false;
    }
    if (statusFilter === "error" && s.status !== "ERROR") return false;
    if (nodeFilter !== "all" && s.nodeId !== nodeFilter) return false;
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (!q) return true;
    const hay = [
      s.name,
      s.type,
      s.mcVersion,
      s.ownerUsername,
      s.nodeName,
      s.subdomain,
      String(s.port),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
