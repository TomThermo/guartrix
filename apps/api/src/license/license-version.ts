import type { PanelVersionStatus } from "@msm/shared";
import { getProductVersion, isUpdateAvailable, meetsMinVersion } from "../product-version.js";
import { getLicenseServerUrl } from "./license-store.js";
import { validateLicense } from "./license-validate.js";

/** Admin-facing version / update status (uses license cache + optional /v1/latest). */
export async function getPanelVersionStatus(force = false): Promise<PanelVersionStatus> {
  const current = getProductVersion();
  const checkedAt = new Date().toISOString();
  try {
    const state = await validateLicense(force);
    if (state.status !== "unreachable" && (state.latestVersion || state.minVersion)) {
      return {
        current,
        latest: state.latestVersion ?? null,
        minVersion: state.minVersion ?? null,
        upToDate: !state.updateAvailable,
        updateAvailable: Boolean(state.updateAvailable),
        belowMinimum: Boolean(state.belowMinimum),
        notes: state.versionNotes ?? null,
        checkedAt,
        source: "license-server",
      };
    }
    // No key / unknown — still try public channel endpoint
    const base = await getLicenseServerUrl();
    const res = await fetch(`${base}/v1/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      latestVersion?: string;
      minVersion?: string;
      notes?: string;
    };
    const latest = data.latestVersion?.trim() || null;
    const minVersion = data.minVersion?.trim() || null;
    return {
      current,
      latest,
      minVersion,
      upToDate: latest ? !isUpdateAvailable(current, latest) : true,
      updateAvailable: latest ? isUpdateAvailable(current, latest) : false,
      belowMinimum: minVersion ? !meetsMinVersion(current, minVersion) : false,
      notes: data.notes?.trim() || null,
      checkedAt,
      source: "license-server",
    };
  } catch {
    return {
      current,
      latest: null,
      minVersion: null,
      upToDate: true,
      updateAvailable: false,
      belowMinimum: false,
      notes: null,
      checkedAt,
      source: "unreachable",
    };
  }
}
