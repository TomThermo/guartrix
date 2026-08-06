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
  Card,
  Offcanvas,
  Spinner,
} from "react-bootstrap";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { UpdateBanner } from "../components/UpdateBanner";
import { copyText } from "../utils";
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
import { ServerDetailModals } from "../components/server-detail/ServerDetailModals";
import { ServerDetailTabs } from "../components/server-detail/ServerDetailTabs";

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

      <ServerDetailModals
        server={server}
        busy={busy}
        whitelistPrompt={whitelistPrompt}
        showWhitelistModal={showWhitelistModal}
        killPrompt={killPrompt}
        showClone={showClone}
        showReinstall={showReinstall}
        showChangeType={showChangeType}
        showVersionPicker={showVersionPicker}
        showTransfer={showTransfer}
        showNodeTransfer={showNodeTransfer}
        showDelete={showDelete}
        onSetWhitelistPrompt={setWhitelistPrompt}
        onSetShowWhitelistModal={setShowWhitelistModal}
        onSetKillPrompt={setKillPrompt}
        onSetShowClone={setShowClone}
        onSetShowReinstall={setShowReinstall}
        onSetShowChangeType={setShowChangeType}
        onSetShowVersionPicker={setShowVersionPicker}
        onSetShowTransfer={setShowTransfer}
        onSetShowNodeTransfer={setShowNodeTransfer}
        onSetShowDelete={setShowDelete}
        onAct={act}
        onSetServer={setServer}
        onSetError={setError}
        onSetNotice={setNotice}
        onRefreshUser={refreshUser}
        onNavigate={navigate}
        onLoad={load}
      />

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
      {server.errorMessage &&
        server.status === "ERROR" &&
        !/already running/i.test(server.errorMessage) && (
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

      <Card className="server-detail-card">
        <div className="server-detail-layout">
          <aside className="server-side-nav">
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
              <ServerDetailTabs
                tab={tab}
                server={server}
                id={id}
                perms={perms}
                connectInfo={connectInfo}
                systemInfo={systemInfo}
                busy={busy}
                consoleNotices={consoleNotices}
                canPowerStart={canPowerStart}
                canPowerStop={canPowerStop}
                canPowerKill={canPowerKill}
                canPowerRestart={canPowerRestart}
                can={can}
                onStatus={onStatus}
                onRequestStart={requestStart}
                onAct={act}
                onSetKillPrompt={setKillPrompt}
                onSetServer={setServer}
                onSetError={setError}
                onSetNotice={setNotice}
                onSetAddonUpdateCount={setAddonUpdateCount}
              />
            </Card.Body>
          </div>
        </div>
      </Card>
    </>
  );
}
