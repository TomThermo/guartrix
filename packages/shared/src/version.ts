/** Release channel published by the license server (latest / min panel version). */

export interface ReleaseChannel {
  /** Newest Guartrix build customers should run */
  latestVersion: string;
  /** Optional floor — panels below this get a warning (not hard-blocked yet) */
  minVersion: string;
  notes: string;
  updatedAt: string;
}

export interface PanelVersionStatus {
  current: string;
  latest: string | null;
  minVersion: string | null;
  upToDate: boolean;
  updateAvailable: boolean;
  belowMinimum: boolean;
  notes: string | null;
  checkedAt: string;
  source: "license-server" | "local" | "unreachable";
}
