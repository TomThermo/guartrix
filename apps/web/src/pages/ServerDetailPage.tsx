import { useCallback, useEffect, useState } from "react";
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
  Badge,
  Button,
  Card,
  Nav,
  Offcanvas,
  Spinner,
  Tab,
} from "react-bootstrap";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { ActivityPanel } from "../components/ActivityPanel";
import { AddonPanel } from "../components/AddonPanel";
import { BackupPanel } from "../components/BackupPanel";
import { BansPanel } from "../components/BansPanel";
import { BotsPanel } from "../components/BotsPanel";
import { ServerConsoleLayout } from "../components/ServerConsoleLayout";
import { DatabasesPanel } from "../components/DatabasesPanel";
import { AllocationsPanel } from "../components/AllocationsPanel";
import { CloneServerModal } from "../components/CloneServerModal";
import { ChangeTypeModal } from "../components/ChangeTypeModal";
import { ReinstallServerModal } from "../components/ReinstallServerModal";
import { DeleteServerModal } from "../components/DeleteServerModal";
import { EngineSettingsPanel } from "../components/EngineSettingsPanel";
import { ModpackPanel } from "../components/ModpackPanel";
import { FileManager } from "../components/FileManager";
import { LogPanel } from "../components/LogPanel";
import { OnlinePlayers } from "../components/OnlinePlayers";
import { ResourceMeter } from "../components/ResourceMeter";
import { ServerSettings } from "../components/ServerSettings";
import { WorldSeedMapCard } from "../components/WorldSeedMapCard";
import { SftpPanel } from "../components/SftpPanel";
import { SubUsersPanel } from "../components/SubUsersPanel";
import { TasksPanel } from "../components/TasksPanel";
import { UpdateBanner } from "../components/UpdateBanner";
import { VersionPickerModal } from "../components/VersionPickerModal";
import { WhitelistManagerPanel } from "../components/WhitelistManagerPanel";
import { WhitelistStartModal } from "../components/WhitelistStartModal";
import { WhitelistToggleModal } from "../components/WhitelistToggleModal";
import { KillServerModal } from "../components/KillServerModal";
import { TransferOwnerModal } from "../components/TransferOwnerModal";
import { TransferNodeModal } from "../components/TransferNodeModal";
import { statusBadgeClass, typeIcon, typeLabel, copyText } from "../utils";
import {
  OnlinePlayersProvider,
  useSharedOnlinePlayers,
} from "../hooks/OnlinePlayersProvider";
import { useVisibleInterval } from "../hooks/useVisibleInterval";

type TabId =
  | "settings"
  | "seedmap"
  | "engine"
  | "addons"
  | "modpacks"
  | "files"
  | "sftp"
  | "console"
  | "resources"
  | "players"
  | "bans"
  | "whitelist"
  | "backups"
  | "activity"
  | "logs"
  | "tasks"
  | "bots"
  | "databases"
  | "allocations"
  | "subusers";

type MenuGroupId = "service" | "game" | "management";

const MENU_GROUPS: Array<{ id: MenuGroupId; label: string }> = [
  { id: "service", label: "Manage Service" },
  { id: "game", label: "Game" },
  { id: "management", label: "Management" },
];

const SERVER_TABS: Array<{
  id: TabId;
  icon: string;
  label: string;
  group: MenuGroupId;
  adminOnly?: boolean;
  /** Any of these permissions grants tab visibility (`*` always ok). */
  anyOf?: string[];
}> = [
  // Manage Service
  {
    id: "console",
    icon: "fa-terminal",
    label: "Console",
    group: "service",
    anyOf: [
      "control.console",
      "control.start",
      "control.stop",
      "control.restart",
      "control.kill",
      "allocation.read",
    ],
  },
  {
    id: "files",
    icon: "fa-folder-open",
    label: "File Manager",
    group: "service",
    anyOf: ["file.read"],
  },
  {
    id: "sftp",
    icon: "fa-network-wired",
    label: "SFTP",
    group: "service",
    anyOf: ["file.sftp"],
  },
  {
    id: "databases",
    icon: "fa-database",
    label: "Databases",
    group: "service",
    anyOf: ["database.read"],
  },
  {
    id: "allocations",
    icon: "fa-ethernet",
    label: "Network",
    group: "service",
    anyOf: ["allocation.read"],
  },
  {
    id: "backups",
    icon: "fa-box-archive",
    label: "Backups",
    group: "service",
    anyOf: ["backup.read"],
  },
  {
    id: "subusers",
    icon: "fa-user-group",
    label: "Subusers",
    group: "service",
    anyOf: ["user.read", "user.create", "user.update", "user.delete"],
  },
  // Game
  {
    id: "settings",
    icon: "fa-gear",
    label: "Server Properties",
    group: "game",
    anyOf: ["settings.read", "settings.update", "startup.read", "startup.update"],
  },
  {
    id: "seedmap",
    icon: "fa-map-location-dot",
    label: "World Map",
    group: "game",
    anyOf: ["settings.read", "control.console"],
  },
  {
    id: "engine",
    icon: "fa-microchip",
    label: "Engine",
    group: "game",
    anyOf: ["settings.read", "settings.update"],
  },
  {
    id: "addons",
    icon: "fa-puzzle-piece",
    label: "Plugin Management",
    group: "game",
    anyOf: ["addon.read"],
  },
  {
    id: "modpacks",
    icon: "fa-cubes",
    label: "Modpacks",
    group: "game",
    anyOf: ["addon.read"],
  },
  {
    id: "whitelist",
    icon: "fa-user-check",
    label: "Whitelist Manager",
    group: "game",
    anyOf: ["player.read", "player.update", "settings.read", "settings.update"],
  },
  {
    id: "players",
    icon: "fa-user-plus",
    label: "Online Players",
    group: "game",
    anyOf: ["player.read"],
  },
  {
    id: "bans",
    icon: "fa-ban",
    label: "Bans",
    group: "game",
    anyOf: ["player.read"],
  },
  // Management
  {
    id: "tasks",
    icon: "fa-clock",
    label: "Schedules",
    group: "management",
    anyOf: ["schedule.read"],
  },
  {
    id: "activity",
    icon: "fa-list-check",
    label: "Activity Log",
    group: "management",
    anyOf: ["activity.read", "audit.read"],
  },
  {
    id: "logs",
    icon: "fa-magnifying-glass",
    label: "Log Files",
    group: "management",
    anyOf: ["audit.read"],
  },
  {
    id: "resources",
    icon: "fa-chart-line",
    label: "Resources",
    group: "management",
  },
  {
    id: "bots",
    icon: "fa-robot",
    label: "Bots",
    group: "management",
    adminOnly: true,
  },
];

const TAB_IDS = new Set<string>([
  "settings",
  "seedmap",
  "engine",
  "addons",
  "modpacks",
  "files",
  "sftp",
  "console",
  "resources",
  "players",
  "bans",
  "whitelist",
  "backups",
  "activity",
  "logs",
  "tasks",
  "bots",
  "databases",
  "allocations",
  "subusers",
]);

function parseTabParam(value: string | null): TabId | null {
  if (!value || !TAB_IDS.has(value)) return null;
  return value as TabId;
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
      setError(err instanceof Error ? err.message : "Failed to load");
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
      setError("Could not copy address");
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

  const visibleTabs = SERVER_TABS.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.id === "addons" && !supportsAddons) return false;
    if (t.id === "engine" && !supportsEngine) return false;
    if (t.id === "modpacks" && !supportsModpacks) return false;
    if (!t.anyOf || t.anyOf.length === 0) return true;
    // Respect effective permissions (license feature ceiling already applied).
    // Do not bypass for owners — owners without a feature must not see that tab.
    return t.anyOf.some((p) => hasPermission(perms, p as "control.console"));
  }).map((t) =>
    t.id === "addons" ? { ...t, label: "Plugin Management" } : t,
  );
  const menuSections = MENU_GROUPS.map((group) => ({
    ...group,
    items: visibleTabs.filter((t) => t.group === group.id),
  })).filter((section) => section.items.length > 0);
  const whitelistOn =
    server.whitelistEnabled || server.properties?.["white-list"] === "true";
  const isRunning =
    server.status === "RUNNING" || server.status === "STARTING";

  function renderSideMenu(opts?: { onPick?: () => void }) {
    return (
      <Nav
        className="flex-column server-side-nav-list"
        activeKey={tab}
        onSelect={(k) => {
          if (!k) return;
          changeTab(k as TabId);
          opts?.onPick?.();
        }}
      >
        <div className="server-side-nav-section">
          <div className="server-side-nav-header">General</div>
          <Link
            to="/"
            className="server-side-nav-link"
            onClick={() => opts?.onPick?.()}
          >
            <i className="fa-solid fa-server" aria-hidden />
            <span>Server list</span>
          </Link>
        </div>
        {menuSections.map((section) => (
          <div key={section.id} className="server-side-nav-section">
            <div className="server-side-nav-header">{section.label}</div>
            {section.items.map((t) => (
              <Nav.Link
                key={t.id}
                eventKey={t.id}
                active={tab === t.id}
                className={`server-side-nav-link${
                  t.id === "whitelist" ||
                  t.id === "console" ||
                  (t.id === "addons" && addonUpdateCount > 0)
                    ? " has-status-badge"
                    : ""
                }`}
              >
                {t.id === "whitelist" && (
                  <span
                    className={`server-nav-status-badge ${whitelistOn ? "is-on" : "is-off"}`}
                    title={whitelistOn ? "Whitelist enabled" : "Whitelist disabled"}
                    aria-hidden
                  >
                    <i className={`fa-solid ${whitelistOn ? "fa-check" : "fa-xmark"}`} />
                  </span>
                )}
                {t.id === "console" && (
                  <span
                    className={`server-nav-power-icon ${isRunning ? "is-on" : "is-off"}`}
                    title={isRunning ? "Server running" : "Server stopped"}
                    aria-hidden
                  >
                    <i className={`fa-solid ${isRunning ? "fa-play" : "fa-stop"}`} />
                  </span>
                )}
                {t.id === "addons" && addonUpdateCount > 0 && (
                  <span
                    className="server-nav-count-badge"
                    title={`${addonUpdateCount} update${addonUpdateCount === 1 ? "" : "s"} available`}
                  >
                    {addonUpdateCount > 99 ? "99+" : addonUpdateCount}
                  </span>
                )}
                <i className={`fa-solid ${t.icon}`} aria-hidden />
                <span>{t.label}</span>
              </Nav.Link>
            ))}
          </div>
        ))}
        {isOwner && (
          <div className="server-side-nav-section">
            <div className="server-side-nav-header">Danger zone</div>
            <button
              type="button"
              className="server-side-nav-link server-side-nav-danger"
              disabled={busy}
              onClick={() => {
                opts?.onPick?.();
                setShowDelete(true);
              }}
            >
              <i className="fa-solid fa-trash" aria-hidden />
              <span>Delete server</span>
            </button>
          </div>
        )}
      </Nav>
    );
  }

  return (
    <>
      <div className="server-detail-header mb-3">
        <div className="server-detail-title-row">
          <Button
            variant="outline-secondary"
            className="server-burger-btn d-lg-none"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open section menu"
          >
            <i className="fa-solid fa-bars" aria-hidden />
          </Button>
          <img
            className="server-icon-badge"
            src={`/api/servers/${server.id}/icon?t=${server.hasIcon ? server.updatedAt : "default"}`}
            alt=""
            width={40}
            height={40}
          />
          <div className="server-detail-title-text min-w-0">
            <div className="server-detail-name-line">
              <h1 className="server-detail-name text-truncate">{server.name}</h1>
              <Button
                size="sm"
                variant="link"
                className="server-detail-address p-0 text-secondary text-decoration-none text-truncate"
                onClick={() => void copyConnect()}
                title="Copy connect address"
              >
                <i className="fa-solid fa-copy" aria-hidden />
                <span className="text-truncate">
                  {connectInfo?.address ?? `:${server.port}`}
                </span>
              </Button>
            </div>
            <div className="server-detail-meta">
              <span className={statusBadgeClass(server.status)}>{server.status}</span>
              <Badge bg="secondary">
                <i className={`fa-solid ${typeIcon(server.type)}`} aria-hidden />
                {typeLabel(server.type)}
              </Badge>
              {isAdmin || server.ownerUsername ? (
                <Badge
                  bg={server.ownerUsername ? "dark" : "secondary"}
                  title={isAdmin ? "Click to transfer owner" : "Owner"}
                  role={isAdmin ? "button" : undefined}
                  style={isAdmin ? { cursor: "pointer" } : undefined}
                  onClick={isAdmin ? () => setShowTransfer(true) : undefined}
                >
                  <i className="fa-solid fa-user" aria-hidden />
                  {server.ownerUsername ?? "Unassigned"}
                </Badge>
              ) : null}
              <span className="server-detail-meta-text">
                {[
                  server.mcVersion,
                  server.fabricLoaderVersion
                    ? `loader ${server.fabricLoaderVersion}`
                    : null,
                  server.forgeVersion ? `forge ${server.forgeVersion}` : null,
                  server.paperBuild ? `build ${server.paperBuild}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {can("player.read") && (
                <Badge
                  bg="secondary"
                  className="server-detail-meta-action"
                  role="button"
                  tabIndex={0}
                  title="Online players — open Online Players"
                  onClick={() => changeTab("players")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      changeTab("players");
                    }
                  }}
                >
                  <i className="fa-solid fa-users" aria-hidden />
                  {online
                    ? `${online.playersOnline}${online.playersMax > 0 ? `/${online.playersMax}` : ""}`
                    : server.status === "RUNNING"
                      ? "…/…"
                      : "0/0"}
                </Badge>
              )}
              {can("settings.read") && (
                <Badge
                  bg={whitelistOn ? "success" : "warning"}
                  text={whitelistOn ? undefined : "dark"}
                  className="server-detail-meta-action"
                  role="button"
                  tabIndex={0}
                  title={
                    can("settings.update")
                      ? "Click to change whitelist"
                      : whitelistOn
                        ? "Whitelist enabled"
                        : "Whitelist disabled"
                  }
                  onClick={() => {
                    if (can("settings.update")) setShowWhitelistModal(true);
                    else changeTab("whitelist");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (can("settings.update")) setShowWhitelistModal(true);
                      else changeTab("whitelist");
                    }
                  }}
                >
                  <i
                    className={`fa-solid ${whitelistOn ? "fa-shield-halved" : "fa-shield"}`}
                    aria-hidden
                  />
                  WL {whitelistOn ? "on" : "off"}
                </Badge>
              )}
              {supportsAddons && can("addon.read") && (
                <Badge
                  bg={addonUpdateCount > 0 ? "danger" : "secondary"}
                  className="server-detail-meta-action"
                  role="button"
                  tabIndex={0}
                  title="Open Plugin Management"
                  onClick={() => changeTab("addons")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      changeTab("addons");
                    }
                  }}
                >
                  <i className="fa-solid fa-puzzle-piece" aria-hidden />
                  {addonUpdateCount > 0
                    ? `${addonUpdateCount} update${addonUpdateCount === 1 ? "" : "s"}`
                    : "Up to date"}
                </Badge>
              )}
              {server.autoRestart && (
                <Badge bg="info" text="dark">
                  Auto-restart
                </Badge>
              )}
            </div>
          </div>
          {(canClone || isAdmin || can("settings.update")) && (
            <div className="server-toolbar btn-group btn-group-sm" role="group">
              {can("settings.update") && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Change Minecraft version"
                  onClick={() => setShowVersionPicker(true)}
                >
                  <i className="fa-solid fa-code-branch" />
                  <span className="btn-label">Version</span>
                </Button>
              )}
              {can("settings.update") && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Change software (Paper, Fabric, …)"
                  onClick={() => setShowChangeType(true)}
                >
                  <i className="fa-solid fa-puzzle-piece" />
                  <span className="btn-label">Software</span>
                </Button>
              )}
              {canClone && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Clone server"
                  onClick={() => setShowClone(true)}
                >
                  <i className="fa-solid fa-clone" />
                  <span className="btn-label">Clone</span>
                </Button>
              )}
              {can("settings.update") && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Reinstall server"
                  onClick={() => setShowReinstall(true)}
                >
                  <i className="fa-solid fa-rotate" />
                  <span className="btn-label">Reinstall</span>
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline-secondary"
                  disabled={busy || server.status === "TRANSFERRING"}
                  title="Move to another node"
                  onClick={() => setShowNodeTransfer(true)}
                >
                  <i className="fa-solid fa-right-left" />
                  <span className="btn-label">Move</span>
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  title="Transfer owner"
                  onClick={() => setShowTransfer(true)}
                >
                  <i className="fa-solid fa-user-tag" />
                  <span className="btn-label">Owner</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

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
            {renderSideMenu()}
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
                {renderSideMenu({ onPick: () => setMobileNavOpen(false) })}
              </Offcanvas.Body>
            </Offcanvas>

            <Card.Body className="server-detail-body">
              <Tab.Content>
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
              </Tab.Content>
            </Card.Body>
          </div>
        </div>
      </Card>
    </>
  );
}
