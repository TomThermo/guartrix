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
import { adminServersApi } from "./admin-servers";

export type { PanelSettings, PanelSettingsPatch, ReadinessReport } from "./admin-settings";
export type { AdminServersView, AdminServerPatch } from "./admin-servers";

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
  listAdminServers: adminServersApi.list,
  updateAdminServer: adminServersApi.update,
};
