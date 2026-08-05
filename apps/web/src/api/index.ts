export { ApiError, onUnauthorized, setCsrfToken } from "./client";
import { authApi } from "./auth";
import { accountApi } from "./account";
import { nodesApi } from "./nodes";
import { serversApi } from "./servers";
import { addonsApi } from "./addons";
import { filesApi } from "./files";
import { backupsApi } from "./backups";
import { billingApi } from "./billing";
import { adminSettingsApi } from "./admin-settings";

export type { PanelSettings, PanelSettingsPatch } from "./admin-settings";

export const api = {
  ...authApi,
  ...accountApi,
  ...nodesApi,
  ...serversApi,
  ...addonsApi,
  ...filesApi,
  ...backupsApi,
  ...billingApi,
  ...adminSettingsApi,
};
