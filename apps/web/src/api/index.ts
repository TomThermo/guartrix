export { ApiError, onUnauthorized } from "./client";
import { authApi } from "./auth";
import { accountApi } from "./account";
import { nodesApi } from "./nodes";
import { serversApi } from "./servers";
import { addonsApi } from "./addons";
import { filesApi } from "./files";
import { backupsApi } from "./backups";
import { billingApi } from "./billing";

export const api = {
  ...authApi,
  ...accountApi,
  ...nodesApi,
  ...serversApi,
  ...addonsApi,
  ...filesApi,
  ...backupsApi,
  ...billingApi,
};
