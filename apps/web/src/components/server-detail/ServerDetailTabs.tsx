import { lazy, Suspense } from "react";
import type { ConnectInfo, ServerDetail, ServerStatus, SystemInfo } from "@msm/shared";
import type { hasPermission } from "@msm/shared";
import { Spinner, Tab } from "react-bootstrap";
import { api } from "../../api";
import { ServerConsoleLayout } from "../ServerConsoleLayout";
import type { TabId } from "./server-tabs";

const ActivityPanel = lazy(() =>
  import("../ActivityPanel").then((m) => ({ default: m.ActivityPanel })),
);
const AddonPanel = lazy(() => import("../AddonPanel").then((m) => ({ default: m.AddonPanel })));
const BackupPanel = lazy(() => import("../BackupPanel").then((m) => ({ default: m.BackupPanel })));
const BansPanel = lazy(() => import("../BansPanel").then((m) => ({ default: m.BansPanel })));
const DatabasesPanel = lazy(() =>
  import("../DatabasesPanel").then((m) => ({
    default: m.DatabasesPanel,
  })),
);
const AllocationsPanel = lazy(() =>
  import("../AllocationsPanel").then((m) => ({
    default: m.AllocationsPanel,
  })),
);
const EngineSettingsPanel = lazy(() =>
  import("../EngineSettingsPanel").then((m) => ({
    default: m.EngineSettingsPanel,
  })),
);
const ModpackPanel = lazy(() =>
  import("../ModpackPanel").then((m) => ({ default: m.ModpackPanel })),
);
const FileManager = lazy(() => import("../FileManager").then((m) => ({ default: m.FileManager })));
const LogPanel = lazy(() => import("../LogPanel").then((m) => ({ default: m.LogPanel })));
const OnlinePlayers = lazy(() =>
  import("../OnlinePlayers").then((m) => ({
    default: m.OnlinePlayers,
  })),
);
const ResourceMeter = lazy(() =>
  import("../ResourceMeter").then((m) => ({
    default: m.ResourceMeter,
  })),
);
const ServerSettings = lazy(() =>
  import("../ServerSettings").then((m) => ({
    default: m.ServerSettings,
  })),
);
const WorldSeedMapCard = lazy(() =>
  import("../WorldSeedMapCard").then((m) => ({
    default: m.WorldSeedMapCard,
  })),
);
const SftpPanel = lazy(() => import("../SftpPanel").then((m) => ({ default: m.SftpPanel })));
const SubUsersPanel = lazy(() =>
  import("../SubUsersPanel").then((m) => ({
    default: m.SubUsersPanel,
  })),
);
const TasksPanel = lazy(() => import("../TasksPanel").then((m) => ({ default: m.TasksPanel })));
const WhitelistManagerPanel = lazy(() =>
  import("../WhitelistManagerPanel").then((m) => ({
    default: m.WhitelistManagerPanel,
  })),
);

function TabFallback() {
  return (
    <div className="text-center text-secondary py-5">
      <Spinner animation="border" size="sm" className="me-2" />
      Loading…
    </div>
  );
}

export function ServerDetailTabs({
  tab,
  server,
  id,
  perms,
  connectInfo,
  systemInfo,
  busy,
  consoleNotices,
  canPowerStart,
  canPowerStop,
  canPowerKill,
  canPowerRestart,
  can,
  onStatus,
  onRequestStart,
  onAct,
  onSetKillPrompt,
  onSetServer,
  onSetError,
  onSetNotice,
  onSetAddonUpdateCount,
}: {
  tab: TabId;
  server: ServerDetail;
  id: string;
  perms: string[];
  connectInfo: ConnectInfo | null;
  systemInfo: SystemInfo | null;
  busy: boolean;
  consoleNotices: string[];
  canPowerStart: boolean;
  canPowerStop: boolean;
  canPowerKill: boolean;
  canPowerRestart: boolean;
  can: (p: Parameters<typeof hasPermission>[1]) => boolean;
  onStatus: (status: ServerStatus) => void;
  onRequestStart: () => void;
  onAct: (action: "start" | "stop" | "restart" | "kill") => void;
  onSetKillPrompt: (v: boolean) => void;
  onSetServer: (s: ServerDetail) => void;
  onSetError: (message: string | null) => void;
  onSetNotice: (message: string | null) => void;
  onSetAddonUpdateCount: (n: number) => void;
}) {
  return (
    <Tab.Content>
      <Suspense fallback={<TabFallback />}>
        {tab === "settings" && (
          <ServerSettings
            server={server}
            canUpdateSettings={can("settings.update")}
            canUpdateStartup={can("startup.update")}
            onSaved={(s) => {
              onSetServer(s);
              onSetError(null);
            }}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "seedmap" && (
          <WorldSeedMapCard
            server={server}
            formSeed={server.properties?.["level-seed"]}
            canQueryConsole={can("control.console")}
            onNotice={onSetNotice}
            onError={onSetError}
          />
        )}
        {tab === "engine" && (
          <EngineSettingsPanel
            server={server}
            canUpdate={can("settings.update")}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "modpacks" && (
          <ModpackPanel
            server={server}
            canUpdate={can("addon.update")}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "databases" && (
          <DatabasesPanel
            serverId={id}
            canCreate={can("database.create")}
            canDelete={can("database.delete")}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "allocations" && (
          <AllocationsPanel
            serverId={id}
            serverType={server.type}
            canCreate={can("allocation.create")}
            canUpdate={can("allocation.update")}
            canDelete={can("allocation.delete")}
            canInstallAddons={can("addon.update")}
            onError={onSetError}
            onNotice={onSetNotice}
            onPrimaryChanged={() => {
              void api
                .getServer(id)
                .then(onSetServer)
                .catch(() => undefined);
            }}
          />
        )}
        {tab === "subusers" && (
          <SubUsersPanel
            serverId={id}
            myPermissions={perms}
            canManage={can(["user.read", "user.create", "user.update", "user.delete"])}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "addons" && (
          <AddonPanel
            serverId={id}
            serverType={server.type}
            mcVersion={server.mcVersion}
            canUpdate={can("addon.update")}
            onError={onSetError}
            onNotice={onSetNotice}
            onUpdateCountChange={onSetAddonUpdateCount}
          />
        )}
        {tab === "whitelist" && (
          <WhitelistManagerPanel
            server={server}
            canUpdate={can("player.update") || can("settings.update")}
            onSaved={(s) => {
              onSetServer(s);
              onSetError(null);
            }}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "players" && (
          <>
            <p className="text-secondary">
              Live list from status ping and console join/leave. Click a player for actions.
            </p>
            <OnlinePlayers
              serverId={id}
              active={server.status === "RUNNING" || server.status === "STARTING"}
              canUpdate={can("player.update")}
              onError={onSetError}
              onNotice={onSetNotice}
            />
          </>
        )}
        {tab === "bans" && (
          <BansPanel
            serverId={id}
            serverRunning={server.status === "RUNNING" || server.status === "STARTING"}
            canUpdate={can("player.update")}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "files" && (
          <>
            <p className="text-secondary">
              Browse and edit server files. Text up to 2 MB; uploads up to 100 MB.
            </p>
            <FileManager
              serverId={id}
              diskMb={server.diskMb}
              active={tab === "files"}
              canReadContent={can("file.read-content")}
              canUpdate={can("file.update")}
              canCreate={can("file.create")}
              canUpload={can("file.upload")}
              canDelete={can("file.delete")}
              canDownload={can("file.download")}
              canArchive={can("file.archive")}
              onError={onSetError}
            />
          </>
        )}
        {tab === "sftp" && <SftpPanel serverId={id} onError={onSetError} onNotice={onSetNotice} />}
        {tab === "backups" && (
          <BackupPanel
            serverId={id}
            canCreate={can("backup.create")}
            canDelete={can("backup.delete")}
            canRestore={can("backup.restore")}
            canEditSchedule={can("backup.create")}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "activity" && <ActivityPanel serverId={id} onError={onSetError} />}
        {tab === "logs" && <LogPanel serverId={id} onError={onSetError} />}
        {tab === "tasks" && (
          <TasksPanel
            serverId={id}
            canCreate={can("schedule.create")}
            canUpdate={can("schedule.update")}
            canDelete={can("schedule.delete")}
            onError={onSetError}
            onNotice={onSetNotice}
          />
        )}
        {tab === "resources" && (
          <>
            <p className="text-secondary mb-3">
              Disk breakdown is always available. CPU, memory, and network require a running server.
            </p>
            <ResourceMeter
              serverId={id}
              active={server.status === "RUNNING" || server.status === "STARTING"}
              diskMb={server.diskMb}
            />
          </>
        )}
        {tab === "console" && (
          <ServerConsoleLayout
            server={server}
            connect={connectInfo}
            system={systemInfo}
            canStart={canPowerStart}
            canStop={canPowerStop}
            canKill={canPowerKill}
            canRestart={canPowerRestart}
            canSendConsole={can("control.console")}
            canViewPlayers={can("player.read")}
            canManagePlayers={can("player.update")}
            busy={busy}
            onStatus={onStatus}
            onStart={onRequestStart}
            onStop={() => void onAct("stop")}
            onKill={() => onSetKillPrompt(true)}
            onRestart={() => void onAct("restart")}
            onError={onSetError}
            onNotice={onSetNotice}
            consoleNotices={consoleNotices}
          />
        )}
      </Suspense>
    </Tab.Content>
  );
}
