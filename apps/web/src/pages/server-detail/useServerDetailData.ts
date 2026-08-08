import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ConnectInfo, ServerDetail, ServerStatus, SystemInfo } from "@msm/shared";
import { addonKindFor, canCreateServer, hasPermission } from "@msm/shared";
import { api, ApiError } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { copyText } from "../../utils";
import { useSharedOnlinePlayers } from "../../hooks/OnlinePlayersProvider";
import { useVisibleInterval } from "../../hooks/useVisibleInterval";
import {
  MENU_GROUPS,
  SERVER_TABS,
  parseTabParam,
  type TabId,
} from "../../components/server-detail/server-tabs";

export function useServerDetailData({
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
    !!user && (user.role === "ADMIN" || server?.isOwner === true || server?.ownerId === user.id);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(perms, p);

  useEffect(() => {
    onPlayerAccessChange(hasPermission(perms, "player.read"));
  }, [perms, onPlayerAccessChange]);

  const canClone = isOwner && canCreateServer(user);
  const canPowerStart = can("control.start");
  const canPowerStop = can("control.stop");
  const canPowerKill = can("control.kill");
  const canPowerRestart = can("control.restart");
  const [tab, setTab] = useState<TabId>(() => parseTabParam(searchParams.get("tab")) ?? "console");
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
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while install/start is in progress so console shows Creating: … progress.
  useVisibleInterval(
    () => {
      void load();
    },
    1500,
    Boolean(server && (server.status === "CREATING" || server.status === "STARTING")),
  );

  // Mirror CREATING progress into the console panel.
  useEffect(() => {
    if (!server || server.status !== "CREATING") return;
    const msg = server.errorMessage?.trim();
    if (!msg) return;
    setConsoleNotices((prev) => {
      if (prev[prev.length - 1] === msg) return prev;
      return [...prev.filter((m) => !m.startsWith("Creating:")), msg].slice(-6);
    });
  }, [server?.status, server?.errorMessage]);

  useEffect(() => {
    const state = location.state as { consoleNotice?: string; fromCreate?: boolean } | null;
    if (state?.fromCreate) {
      setTab("console");
      setConsoleNotices((prev) =>
        prev.includes("Creating: preparing…")
          ? prev
          : [...prev, t("serverDetail.creatingStarted")],
      );
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
      return;
    }
    const msg = state?.consoleNotice?.trim();
    if (!msg) return;
    setConsoleNotices((prev) => (prev.includes(msg) ? prev : [...prev.slice(-4), msg]));
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate, t]);

  useEffect(() => {
    const fromUrl = parseTabParam(searchParams.get("tab"));
    setTab(fromUrl ?? "console");
  }, [searchParams]);

  // If the active tab is not allowed (license/subuser), jump to the first visible one.
  useEffect(() => {
    if (!server) return;
    const allowed = SERVER_TABS.filter((tabDef) => {
      if (tabDef.adminOnly && user?.role !== "ADMIN") return false;
      if (tabDef.id === "addons" && !addonKindFor(server.type)) return false;
      if (tabDef.id === "engine" && !(server.type === "PAPER" || server.type === "PURPUR"))
        return false;
      if (
        tabDef.id === "modpacks" &&
        !(
          server.type === "FABRIC" ||
          server.type === "QUILT" ||
          server.type === "FORGE" ||
          server.type === "NEOFORGE"
        )
      )
        return false;
      if (!tabDef.anyOf || tabDef.anyOf.length === 0) return true;
      return tabDef.anyOf.some((p) => hasPermission(perms, p as "control.console"));
    });
    if (allowed.some((tabDef) => tabDef.id === tab)) return;
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
    void api
      .getConnectInfo(id)
      .then(setConnectInfo)
      .catch(() => setConnectInfo(null));
  }, [id]);

  // Host capacity is only needed for console sidebar / clone flows — load lazily.
  useEffect(() => {
    if (tab !== "console" && tab !== "resources") return;
    if (systemInfo) return;
    void api
      .getSystem()
      .then(setSystemInfo)
      .catch(() => setSystemInfo(null));
  }, [id, tab, systemInfo]);

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
    // Immediate check only when viewing addons; otherwise defer.
    if (tab === "addons") refresh();
    else {
      const t = window.setTimeout(refresh, 8_000);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [id, server, server?.type, server?.mcVersion, tab]);

  useVisibleInterval(
    () => {
      if (!server || !addonKindFor(server.type)) return;
      if (tab !== "addons" && tab !== "console") return;
      void api
        .listAddonUpdates(id)
        .then((r) => setAddonUpdateCount(r.available))
        .catch(() => undefined);
    },
    180_000,
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
    const whitelistOn = server?.whitelistEnabled || server?.properties?.["white-list"] === "true";
    if (!whitelistOn) {
      setWhitelistPrompt(true);
      return;
    }
    void act("start");
  }

  async function act(action: "start" | "stop" | "restart" | "kill", enableWhitelist = false) {
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
      const licenseCode = err instanceof ApiError ? String(err.code ?? "") : "";
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

  async function copyConnect() {
    const address = connectInfo?.address ?? `:${server?.port ?? ""}`;
    try {
      await copyText(address);
      setNotice(`Copied ${address}`);
    } catch {
      setError(t("common.copyAddressFailed"));
    }
  }

  const supportsEngine = !!server && (server.type === "PAPER" || server.type === "PURPUR");
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
  const whitelistOn = !!(server?.whitelistEnabled || server?.properties?.["white-list"] === "true");
  const isRunning = server?.status === "RUNNING" || server?.status === "STARTING";

  return {
    id,
    navigate,
    refreshUser,
    server,
    setServer,
    error,
    setError,
    notice,
    setNotice,
    consoleNotices,
    busy,
    perms,
    isOwner,
    can,
    canClone,
    canPowerStart,
    canPowerStop,
    canPowerKill,
    canPowerRestart,
    tab,
    whitelistPrompt,
    setWhitelistPrompt,
    killPrompt,
    setKillPrompt,
    connectInfo,
    systemInfo,
    showTransfer,
    setShowTransfer,
    showNodeTransfer,
    setShowNodeTransfer,
    showDelete,
    setShowDelete,
    showClone,
    setShowClone,
    showReinstall,
    setShowReinstall,
    showChangeType,
    setShowChangeType,
    showVersionPicker,
    setShowVersionPicker,
    mobileNavOpen,
    setMobileNavOpen,
    addonUpdateCount,
    setAddonUpdateCount,
    online,
    showWhitelistModal,
    setShowWhitelistModal,
    isAdmin,
    supportsAddons,
    load,
    onStatus,
    changeTab,
    requestStart,
    act,
    copyConnect,
    menuSections,
    whitelistOn,
    isRunning,
  };
}
