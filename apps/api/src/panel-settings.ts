/**
 * Admin panel settings stored in data/panel-settings.json.
 * Env remains the baseline; this file overrides selected keys at runtime
 * and syncs web/HTTPS-related keys back into .env (restart required).
 */
export type {
  PanelSettingsStored,
  PanelSettingsView,
  PanelSettingsPatch,
} from "./panel-settings/types.js";
export { readStoredSettings, writeStoredSettings } from "./panel-settings/io.js";
export { applyPanelSettings, loadAndApplyPanelSettings } from "./panel-settings/apply.js";
export { getPanelSettingsView, getPublicBranding } from "./panel-settings/view.js";
export { mergePanelSettingsPatch } from "./panel-settings/merge.js";
export { syncEnvFromSettings, restartRequiredForPatch } from "./panel-settings/env-sync.js";
