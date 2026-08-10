import type { ServerStatus } from "@guartrix/shared";
import { recordActivity } from "./activity-log.js";
import { processManager } from "./servers/process-manager.js";

/**
 * Turns daemon status transitions into activity events. A panel-issued stop
 * always passes through STOPPING first, so RUNNING → STOPPED means the process
 * died on its own.
 */
const lastStatus = new Map<string, ServerStatus>();

export function startActivityWatch(): void {
  processManager.on(
    "status",
    (serverId: string, status: ServerStatus, errorMessage: string | null) => {
      const before = lastStatus.get(serverId);
      lastStatus.set(serverId, status);
      if (!before || before === status) return;

      const reason = errorMessage ?? "";
      const isOom =
        status === "ERROR" && /oom|out of memory|exit.?137|killed.*memory/i.test(reason);

      const action = isOom
        ? "server.oom"
        : status === "ERROR" && /auto-restart stopped/i.test(reason)
          ? "server.crash_loop"
          : status === "ERROR"
            ? "server.crashed"
            : status === "STOPPED" && before === "RUNNING"
              ? "server.offline"
              : null;
      if (!action) return;

      void recordActivity({
        action,
        actor: "system",
        serverId,
        success: false,
        metadata: {
          previousStatus: before,
          status,
          ...(errorMessage ? { reason: errorMessage } : {}),
        },
      });
    },
  );
}
