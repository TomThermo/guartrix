/**
 * Barrel re-export for daemon client helpers.
 * Implementation lives in daemon-client-*.ts domain modules.
 */

export {
  DaemonHttpError,
  setNodeToken,
  clearNodeToken,
  getNodeToken,
  loadPersistedNodeTokens,
  resolveNodeForServer,
  daemonWsAuthorization,
  daemonWsUrl,
  daemonFetch,
  baseUrl,
} from "./daemon-client-core.js";

export type { DaemonStatusSnapshot } from "./daemon-client-power.js";
export {
  daemonGetSystem,
  daemonGetStatus,
  daemonTestNode,
  daemonCleanupContainers,
  daemonPower,
  daemonPushLicenseTicket,
  daemonPushLicenseTicketAll,
  daemonSetLimits,
  daemonCommand,
  daemonIsRunning,
  daemonIsPortFree,
  daemonChown,
  daemonStats,
  daemonStatsHistory,
  daemonDisk,
  daemonOnlineNames,
  daemonHistory,
  daemonFirewallOpen,
  daemonFirewallClose,
  daemonOpenFirewallForGamePort,
} from "./daemon-client-power.js";

export {
  daemonListFiles,
  daemonReadFile,
  daemonWriteFile,
  daemonMkdir,
  daemonRename,
  daemonDeleteFile,
  daemonDownloadFile,
  daemonCompressFiles,
  daemonDownloadZip,
  daemonDecompressFile,
} from "./daemon-client-files.js";

export {
  daemonMysqlStatus,
  daemonMysqlEnsure,
  daemonMysqlCreate,
  daemonMysqlDelete,
  daemonMysqlRotatePassword,
  daemonMysqlDumpToFile,
  daemonMysqlRestoreFromFile,
} from "./daemon-client-mysql.js";

export {
  daemonPeerDeployArchiveOnNode,
  daemonDeployArchiveFileOnNode,
  daemonDeployFromDir,
  daemonExportArchiveToFileOnNode,
  daemonExportArchiveToFile,
  daemonExportArchive,
  daemonWipeServerOnNode,
  daemonWipeServer,
} from "./daemon-client-deploy.js";
