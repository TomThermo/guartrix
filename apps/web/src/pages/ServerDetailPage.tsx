import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type {
  ConnectInfo,
  ServerDetail,
  ServerStatus,
  SystemInfo,
} from "@msm/shared";
import { addonKindFor, canCreateServer, hasPermission } from "@msm/shared";
import {
  Alert,
  Card,
  Offcanvas,
  Spinner,
  Tab,
} from "react-bootstrap";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { ServerConsoleLayout } from "../components/ServerConsoleLayout";
import { CloneServerModal } from "../components/CloneServerModal";
import { ChangeTypeModal } from "../components/ChangeTypeModal";
import { ReinstallServerModal } from "../components/ReinstallServerModal";
import { DeleteServerModal } from "../components/DeleteServerModal";
import { UpdateBanner } from "../components/UpdateBanner";
import { VersionPickerModal } from "../components/VersionPickerModal";
import { WhitelistStartModal } from "../components/WhitelistStartModal";
import { WhitelistToggleModal } from "../components/WhitelistToggleModal";
import { KillServerModal } from "../components/KillServerModal";
import { TransferOwnerModal } from "../components/TransferOwnerModal";
import { TransferNodeModal } from "../components/TransferNodeModal";
import { typeLabel, copyText } from "../utils";
import {
  OnlinePlayersProvider,
  useSharedOnlinePlayers,
} from "../hooks/OnlinePlayersProvider";
import { useVisibleInterval } from "../hooks/useVisibleInterval";

import {
  MENU_GROUPS,
  SERVER_TABS,
  parseTabParam,
  type TabId,
} from "../components/server-detail/server-tabs";
import { ServerDetailHeader } from "../components/server-detail/ServerDetailHeader";
import { ServerDetailSideNav } from "../components/server-detail/ServerDetailSideNav";

const ActivityPanel = lazy(() =>
  import("../components/ActivityPanel").then((m) => ({ default: m.ActivityPanel })),
);
const AddonPanel = lazy(() =>
  import("../components/AddonPanel").then((m) => ({ default: m.AddonPanel })),
);
const BackupPanel = lazy(() =>
  import("../components/BackupPanel").then((m) => ({ default: m.BackupPanel })),
);
const BansPanel = lazy(() =>
  import("../components/BansPanel").then((m) => ({ default: m.BansPanel })),
);
const BotsPanel = lazy(() =>
  import("../components/BotsPanel").then((m) => ({ default: m.BotsPanel })),
);
const DatabasesPanel = lazy(() =>
  import("../components/DatabasesPanel").then((m) => ({
    default: m.DatabasesPanel,
  })),
);
const AllocationsPanel = lazy(() =>
  import("../components/AllocationsPanel").then((m) => ({
    default: m.AllocationsPanel,
  })),
);
const EngineSettingsPanel = lazy(() =>
  import("../components/EngineSettingsPanel").then((m) => ({
    default: m.EngineSettingsPanel,
  })),
);
const ModpackPanel = lazy(() =>
  import("../components/ModpackPanel").then((m) => ({ default: m.ModpackPanel })),
);
const FileManager = lazy(() =>
  import("../components/FileManager").then((m) => ({ default: m.FileManager })),
);
const LogPanel = lazy(() =>
  import("../components/LogPanel").then((m) => ({ default: m.LogPanel })),
);
const OnlinePlayers = lazy(() =>
  import("../components/OnlinePlayers").then((m) => ({
    default: m.OnlinePlayers,
  })),
);
const ResourceMeter = lazy(() =>
  import("../components/ResourceMeter").then((m) => ({
    default: m.ResourceMeter,
  })),
);
const ServerSettings = lazy(() =>
  import("../components/ServerSettings").then((m) => ({
    default: m.ServerSettings,
  })),
);
const WorldSeedMapCard = lazy(() =>
  import("../components/WorldSeedMapCard").then((m) => ({
    default: m.WorldSeedMapCard,
  })),
);
const SftpPanel = lazy(() =>
  import("../components/SftpPanel").then((m) => ({ default: m.SftpPanel })),
);
const SubUsersPanel = lazy(() =>
  import("../components/SubUsersPanel").then((m) => ({
    default: m.SubUsersPanel,
  })),
);
const TasksPanel = lazy(() =>
  import("../components/TasksPanel").then((m) => ({ default: m.TasksPanel })),
);
const WhitelistManagerPanel = lazy(() =>
  import("../components/WhitelistManagerPanel").then((m) => ({
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

export function ServerDetailPage() {
  const { id = "" } = useParams();
  const [playersEnabled, setPlayersEnabled] = useState(true);
  return (
    <OnlinePlayersProvider
      serverId={id}
      enabled={Boolean(id) && playersEnabled}
    >
      <ServerDetailPageInner onPlayerAccessChange={setPlayersEnabled} />
    </OnlinePlayersProvider>
  );
}

function ServerDetailPageInner({
  onPlayerAccessChange,
}: {
  onPlayerAccessChange: (enabled: boolean) => void;
}) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consoleNotices, setConsoleNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const perms = server?.permissions ?? (user?.role === "ADMIN" ? ["*"] : []);
  const isOwner =
    !!user &&
    (user.role === "ADMIN" || server?.isOwner === true || server?.ownerId === user.id);
  const can = (p: Parameters<typeof hasPermission>[1]) =>
    hasPermission(perms, p);

  useEffect(() => {
    onPlayerAccessChange(hasPermission(perms, "player.read"));
  }, [perms, onPlayerAccessChange]);

  const canClone = isOwner && canCreateServer(user);
  const canPowerStart = can("control.start");
  const canPowerStop = can("control.stop");
  const canPowerKill = can("control.kill");
  const canPowerRestart = can("control.restart");
  const [tab, setTab] = useState<TabId>(
    () => parseTabParam(searchParams.get("tab")) ?? "console",
  );
  const [whitelistPrompt, setWhitelistPrompt] = useState(false);
  const [killPrompt, setKillPrompt] = useState(false);
  const [connectInfo, setConnectInfo] = useState<ConnectInfo | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showNodeTransfer, setShowNodeTransfer] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showReinstall, setShowReinstall] = useState(false);
  const [showChangeType, setShowChangeType] = useState(false);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [addonUpdateCount, setAddonUpdateCount] = useState(0);
  const sharedOnline = useSharedOnlinePlayers();
  const online = sharedOnline?.data ?? null;
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);
  const isAdmin = user?.role === "ADMIN";
  const supportsAddons = !!server && !!addonKindFor(server.type);

  const load = useCallback(async () => {
    try {
      const s = await api.getServer(id);
      setServer(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.loadFailed"));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fromUrl = parseTabParam(searchParams.get("tab"));
    setTab(fromUrl ?? "console");
  }, [id, searchParams]);

  // If the active tab is not allowed (license/subuser), jump to the first visible one.
  useEffect(() => {
    if (!server) return;
    const allowed = SERVER_TABS.filter((t) => {
      if (t.adminOnly && user?.role !== "ADMIN") return false;
      if (t.id === "addons" && !addonKindFor(server.type)) return false;
      if (
        t.id === "engine" &&
        !(server.type === "PAPER" || server.type === "PURPUR")
      )
        return false;
      if (
        t.id === "modpacks" &&
        !(
          server.type === "FABRIC" ||
          server.type === "QUILT" ||
          server.type === "FORGE" ||
          server.type === "NEOFORGE"
        )
      )
        return false;
      if (!t.anyOf || t.anyOf.length === 0) return true;
      return t.anyOf.some((p) => hasPermission(perms, p as "control.console"));
    });
    if (allowed.some((t) => t.id === tab)) return;
    const fallback = allowed[0]?.id ?? "resources";
    if (fallback !== tab) {
      setTab(fallback);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", fallback);
          return next;
        },
        { replace: true },
      );
    }
  }, [server, perms, tab, user?.role, setSearchParams]);

  useEffect(() => {
    const state = location.state as { consoleNotice?: string } | null;
    const msg = state?.consoleNotice?.trim();
    if (!msg) return;
    setConsoleNotices((prev) => (prev.includes(msg) ? prev : [...prev.slice(-4), msg]));
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    void api
      .getConnectInfo(id)
      .then(setConnectInfo)
      .catch(() => setConnectInfo(null));
    void api
      .getSystem()
      .then(setSystemInfo)
      .catch(() => setSystemInfo(null));
  }, [id, server?.port]);

  useEffect(() => {
    if (!server || !addonKindFor(server.type)) {
      setAddonUpdateCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void api
        .listAddonUpdates(id)
        .then((r) => {
          if (!cancelled) setAddonUpdateCount(r.available);
        })
        .catch(() => undefined);
    };
    refresh();
    return () => {
      cancelled = true;
    };
  }, [id, server, server?.type, server?.mcVersion]);

  useVisibleInterval(
    () => {
      if (!server || !addonKindFor(server.type)) return;
      void api
        .listAddonUpdates(id)
        .then((r) => setAddonUpdateCount(r.available))
        .catch(() => undefined);
    },
    120_000,
    Boolean(server && addonKindFor(server.type)),
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const onStatus = useCallback((status: ServerStatus) => {
    setServer((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  function changeTab(next: TabId) {
    setTab(next);
    setNotice(null);
    setError(null);
    const nextParams = new URLSearchParams(searchParams);
    if (next === "console") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  }

  function requestStart() {
    const whitelistOn =
      server?.whitelistEnabled || server?.properties?.["white-list"] === "true";
    if (!whitelistOn) {
      setWhitelistPrompt(true);
      return;
    }
    void act("start");
  }

  async function act(
    action: "start" | "stop" | "restart" | "kill",
    enableWhitelist = false,
  ) {
    setBusy(true);
    setError(null);
    setWhitelistPrompt(false);
    setKillPrompt(false);
    try {
      if (action === "start") {
        if (enableWhitelist) {
          await api.updateServer(id, {
            properties: { "white-list": "true", "enforce-whitelist": "true" },
          });
        }
        await api.startServer(id);
      } else if (action === "stop") await api.stopServer(id);
      else if (action === "kill") await api.killServer(id);
      else await api.restartServer(id);
      // Successful power action — drop stale license console errors
      if (action === "start" || action === "restart") {
        setConsoleNotices([]);
      }
      await load();
      if (enableWhitelist) {
        setNotice("Whitelist enabled and server starting.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      const licenseCode =
        err instanceof ApiError ? String(err.code ?? "") : "";
      const licenseBlocked =
        (action === "start" || action === "restart") &&
        (licenseCode === "LICENSE_INVALID" ||
          licenseCode === "LICENSE_QUOTA" ||
          /license/i.test(message));
      if (licenseBlocked) {
        const line =
          message && /license|administrator|RAM|server limit/i.test(message)
            ? message.startsWith("ERROR:")
              ? message
              : `ERROR: ${message}`
            : "ERROR: Cannot start — panel license expired or invalid. Please contact your administrator.";
        setConsoleNotices([line]);
        if (tab !== "console") changeTab("console");
      } else {
        setError(message);
      }
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  // Clone uses CloneServerModal

  async function copyConnect() {
    const address = connectInfo?.address ?? `:${server?.port ?? ""}`;
    try {
      await copyText(address);
      setNotice(`Copied ${address}`);
    } catch {
      setError(t("common.copyAddressFailed"));
    }
  }

  if (!server && !error) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }
  if (!server) {
    return (
      <Alert variant="danger">
        {error}{" "}
        <Link to="/">Back</Link>
      </Alert>
    );
  }

  const supportsEngine =
    !!server && (server.type === "PAPER" || server.type === "PURPUR");
  const supportsModpacks =
    !!server &&
    (server.type === "FABRIC" ||
      server.type === "QUILT" ||
      server.type === "FORGE" ||
      server.type === "NEOFORGE");

  const visibleTabs = SERVER_TABS.filter((tabDef) => {
    if (tabDef.adminOnly && !isAdmin) return false;
    if (tabDef.id === "addons" && !supportsAddons) return false;
    if (tabDef.id === "engine" && !supportsEngine) return false;
    if (tabDef.id === "modpacks" && !supportsModpacks) return false;
    if (!tabDef.anyOf || tabDef.anyOf.length === 0) return true;
    // Respect effective permissions (license feature ceiling already applied).
    // Do not bypass for owners — owners without a feature must not see that tab.
    return tabDef.anyOf.some((p) => hasPermission(perms, p as "control.console"));
  });
  const menuSections = MENU_GROUPS.map((group) => ({
    id: group.id,
    label: t(group.labelKey),
    items: visibleTabs
      .filter((tabDef) => tabDef.group === group.id)
      .map((tabDef) => ({
        ...tabDef,
        label: t(tabDef.labelKey),
      })),
  })).filter((section) => section.items.length > 0);
  const whitelistOn =
    server.whitelistEnabled || server.properties?.["white-list"] === "true";
  const isRunning =
    server.status === "RUNNING" || server.status === "STARTING";

  const sideNav = (opts?: { onPick?: () => void }) => (
    <ServerDetailSideNav
      activeTab={tab}
      menuSections={menuSections}
      onChangeTab={changeTab}
      onPick={opts?.onPick}
      whitelistOn={whitelistOn}
      isRunning={isRunning}
      addonUpdateCount={addonUpdateCount}
      isOwner={isOwner}
      busy={busy}
      onDelete={() => setShowDelete(true)}
    />
  );


  return (
    <>
      <ServerDetailHeader
        server={server}
        connectInfo={connectInfo}
        online={online}
        isAdmin={isAdmin}
        canClone={canClone}
        busy={busy}
        whitelistOn={whitelistOn}
        supportsAddons={supportsAddons}
        addonUpdateCount={addonUpdateCount}
        can={can}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onCopyConnect={() => void copyConnect()}
        onChangeTab={changeTab}
        onShowTransfer={() => setShowTransfer(true)}
        onShowWhitelistModal={() => setShowWhitelistModal(true)}
        onShowVersionPicker={() => setShowVersionPicker(true)}
        onShowChangeType={() => setShowChangeType(true)}
        onShowClone={() => setShowClone(true)}
        onShowReinstall={() => setShowReinstall(true)}
        onShowNodeTransfer={() => setShowNodeTransfer(true)}
      />

      {whitelistPrompt && (
        <WhitelistStartModal
          serverName={server.name}
          busy={busy}
          onCancel={() => setWhitelistPrompt(false)}
          onStartAnyway={() => void act("start")}
          onEnableAndStart={() => void act("start", true)}
        />
      )}

      {showWhitelistModal && (
        <WhitelistToggleModal
          server={server}
          busy={busy}
          onCancel={() => setShowWhitelistModal(false)}
          onError={(message) => setError(message)}
          onSaved={(updated) => {
            setServer(updated);
            setShowWhitelistModal(false);
            setNotice(
              updated.properties["white-list"] === "true"
                ? "Whitelist enabled."
                : "Whitelist disabled.",
            );
          }}
        />
      )}

      {killPrompt && (
        <KillServerModal
          serverName={server.name}
          busy={busy}
          onCancel={() => setKillPrompt(false)}
          onConfirm={() => void act("kill")}
        />
      )}

      {showClone && (
        <CloneServerModal
          server={server}
          busy={busy}
          onCancel={() => setShowClone(false)}
          onCloned={async (cloned) => {
            setShowClone(false);
            await refreshUser().catch(() => undefined);
            setNotice(`Cloned as ${cloned.name}`);
            navigate(`/servers/${cloned.id}`);
          }}
        />
      )}

      {showReinstall && (
        <ReinstallServerModal
          server={server}
          busy={busy}
          onCancel={() => setShowReinstall(false)}
          onDone={(next) => {
            setServer((prev) => (prev ? { ...prev, ...next } : prev));
            setShowReinstall(false);
            setNotice("Server reinstalled.");
          }}
        />
      )}

      {showChangeType && (
        <ChangeTypeModal
          server={server}
          busy={busy}
          onCancel={() => setShowChangeType(false)}
          onDone={(next) => {
            setServer((prev) => (prev ? { ...prev, ...next } : prev));
            setShowChangeType(false);
            setNotice(`Software changed to ${typeLabel(next.type)}.`);
          }}
        />
      )}

      {showVersionPicker && (
        <VersionPickerModal
          show={showVersionPicker}
          server={server}
          onHide={() => setShowVersionPicker(false)}
          onUpdated={(s) => {
            setServer((prev) => (prev ? { ...prev, ...s } : prev));
          }}
          onError={setError}
          onNotice={setNotice}
        />
      )}

      {showTransfer && (
        <TransferOwnerModal
          server={server}
          onCancel={() => setShowTransfer(false)}
          onTransferred={(updated) => {
            setServer((prev) => (prev ? { ...prev, ...updated } : prev));
            setShowTransfer(false);
            setNotice(
              updated.ownerUsername
                ? `Owner set to ${updated.ownerUsername}.`
                : "Owner cleared (unassigned).",
            );
          }}
        />
      )}

      {showNodeTransfer && (
        <TransferNodeModal
          server={server}
          busy={busy}
          onCancel={() => setShowNodeTransfer(false)}
          onTransferred={(updated) => {
            setServer((prev) => (prev ? { ...prev, ...updated } : prev));
            if (updated.status !== "TRANSFERRING") {
              setShowNodeTransfer(false);
              if (updated.status === "ERROR") {
                setError(updated.errorMessage ?? "Transfer failed");
              } else {
                setNotice(
                  `Moved to ${updated.nodeName ?? "new node"}${
                    updated.port !== server.port ? ` (port ${updated.port})` : ""
                  }.`,
                );
              }
              void load();
            }
          }}
        />
      )}

      {showDelete && (
        <DeleteServerModal
          serverId={server.id}
          serverName={server.name}
          onCancel={() => setShowDelete(false)}
          onDeleted={() => {
            setShowDelete(false);
            navigate("/");
          }}
        />
      )}

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {server.errorMessage && server.status === "ERROR" && (
        <Alert variant="danger" className="mb-3">
          <div className="fw-semibold mb-1">Start failed</div>
          <div className="mb-0">{server.errorMessage}</div>
          <div className="small text-secondary mt-2 mb-0">
            See the Console for details.
          </div>
        </Alert>
      )}

      <UpdateBanner
        server={server}
        onUpdated={(s) => {
          setServer((prev) => (prev ? { ...prev, ...s } : prev));
        }}
        onError={setError}
        onNotice={setNotice}
      />

      <Card className="server-detail-card border-0 shadow-sm">
        <div className="server-detail-layout">
          <aside className="server-side-nav d-none d-lg-flex">
            {sideNav()}
          </aside>

          <div className="server-detail-panel">
            <Offcanvas
              show={mobileNavOpen}
              onHide={() => setMobileNavOpen(false)}
              placement="start"
              className="server-mobile-offcanvas"
            >
              <Offcanvas.Header closeButton>
                <Offcanvas.Title>Menu</Offcanvas.Title>
              </Offcanvas.Header>
              <Offcanvas.Body className="pt-0">
                {sideNav({ onPick: () => setMobileNavOpen(false) })}
              </Offcanvas.Body>
            </Offcanvas>

            <Card.Body className="server-detail-body">
              <Tab.Content>
            <Suspense fallback={<TabFallback />}>
            {tab === "settings" && (
              <ServerSettings
                server={server}
                canUpdateSettings={can("settings.update")}
                canUpdateStartup={can("startup.update")}
                onSaved={(s) => {
                  setServer(s);
                  setError(null);
                }}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "seedmap" && (
              <WorldSeedMapCard
                server={server}
                formSeed={server.properties?.["level-seed"]}
                canQueryConsole={can("control.console")}
                onNotice={setNotice}
                onError={setError}
              />
            )}
            {tab === "engine" && (
              <EngineSettingsPanel
                server={server}
                canUpdate={can("settings.update")}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "modpacks" && (
              <ModpackPanel
                server={server}
                canUpdate={can("addon.update")}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "databases" && (
              <DatabasesPanel
                serverId={id}
                canCreate={can("database.create")}
                canDelete={can("database.delete")}
                onError={setError}
                onNotice={setNotice}
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
                onError={setError}
                onNotice={setNotice}
                onPrimaryChanged={() => {
                  void api.getServer(id).then(setServer).catch(() => undefined);
                }}
              />
            )}
            {tab === "subusers" && (
              <SubUsersPanel
                serverId={id}
                myPermissions={perms}
                canManage={can([
                  "user.read",
                  "user.create",
                  "user.update",
                  "user.delete",
                ])}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "addons" && (
              <AddonPanel
                serverId={id}
                serverType={server.type}
                mcVersion={server.mcVersion}
                canUpdate={can("addon.update")}
                onError={setError}
                onNotice={setNotice}
                onUpdateCountChange={setAddonUpdateCount}
              />
            )}
            {tab === "whitelist" && (
              <WhitelistManagerPanel
                server={server}
                canUpdate={can("player.update") || can("settings.update")}
                onSaved={(s) => {
                  setServer(s);
                  setError(null);
                }}
                onError={setError}
                onNotice={setNotice}
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
                  onError={setError}
                  onNotice={setNotice}
                />
              </>
            )}
            {tab === "bans" && (
              <BansPanel
                serverId={id}
                serverRunning={server.status === "RUNNING" || server.status === "STARTING"}
                canUpdate={can("player.update")}
                onError={setError}
                onNotice={setNotice}
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
                  onError={setError}
                />
              </>
            )}
            {tab === "sftp" && (
              <SftpPanel
                serverId={id}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "backups" && (
              <BackupPanel
                serverId={id}
                canCreate={can("backup.create")}
                canDelete={can("backup.delete")}
                canRestore={can("backup.restore")}
                canEditSchedule={can("backup.create")}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "activity" && (
              <ActivityPanel serverId={id} onError={setError} />
            )}
            {tab === "logs" && <LogPanel serverId={id} onError={setError} />}
            {tab === "tasks" && (
              <TasksPanel
                serverId={id}
                canCreate={can("schedule.create")}
                canUpdate={can("schedule.update")}
                canDelete={can("schedule.delete")}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "bots" && isAdmin && (
              <BotsPanel
                serverId={id}
                serverRunning={server.status === "RUNNING"}
                onlineMode={server.properties?.["online-mode"] !== "false"}
                onError={setError}
                onNotice={setNotice}
              />
            )}
            {tab === "resources" && (
              <>
                <p className="text-secondary mb-3">
                  Disk breakdown is always available. CPU, memory, and network require a running
                  server.
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
                onStart={requestStart}
                onStop={() => void act("stop")}
                onKill={() => setKillPrompt(true)}
                onRestart={() => void act("restart")}
                onError={setError}
                onNotice={setNotice}
                consoleNotices={consoleNotices}
              />
            )}
            </Suspense>
              </Tab.Content>
            </Card.Body>
          </div>
        </div>
      </Card>
    </>
  );
}
