/**
 * License validation entrypoints + re-exports.
 * Implementation lives in validate-impl.ts.
 */
export {
  clearLicenseKey,
  getCachedLicenseState,
  getInstallId,
  getLicenseKey,
  getLicenseServerUrl,
  getLicenseServerUrlInfo,
  parseLicenseServerUrl,
  setLicenseKey,
  setLicenseServerUrl,
  userFacingLicenseMessage,
} from "./license-store.js";
export type { LicensePanelStatus, LicenseState } from "./license-store.js";
export { getPanelVersionStatus } from "./license-version.js";
export { startLicenseWatcher, stopLicenseWatcher } from "./license-watcher.js";
export { validateLicense } from "./validate-impl.js";
