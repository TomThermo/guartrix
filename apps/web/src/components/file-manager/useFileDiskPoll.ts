import { useCallback, useState } from "react";
import type { DiskUsageBreakdown } from "@msm/shared";
import { api } from "../../api";
import { useVisibleInterval } from "../../hooks/useVisibleInterval";

/** Polls disk usage for a server while `active`, pausing when the tab is hidden. */
export function useFileDiskPoll(serverId: string, active: boolean): DiskUsageBreakdown | null {
  const [disk, setDisk] = useState<DiskUsageBreakdown | null>(null);

  const loadDisk = useCallback(async () => {
    try {
      const next = await api.getDiskUsage(serverId);
      setDisk(next);
    } catch {
      // non-fatal — file list still works
    }
  }, [serverId]);

  useVisibleInterval(() => void loadDisk(), 30_000, active);

  return disk;
}
