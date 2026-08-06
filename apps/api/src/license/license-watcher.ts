import { LICENSE_CACHE_MS } from "./license-store.js";
import { validateLicense } from "./license-validate.js";

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startLicenseWatcher(): void {
  void validateLicense(true).catch((err) => {
    console.warn(
      "[license] initial validate failed:",
      err instanceof Error ? err.message : err,
    );
  });
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    void validateLicense(true).catch(() => undefined);
  }, LICENSE_CACHE_MS);
  console.info(
    `[license] validate interval ${Math.round(LICENSE_CACHE_MS / 1000)}s (LICENSE_VALIDATE_INTERVAL_MS)`,
  );
}

export function stopLicenseWatcher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
