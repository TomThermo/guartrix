import { useEffect, useState, type FormEvent } from "react";
import type {
  AuthUser,
  ConnectInfo,
  ServerDetail,
  ServerExtraMount,
  ServerProperties,
} from "@msm/shared";
import {
  DEFAULT_SERVER_JAR,
  DEFAULT_STARTUP_COMMAND,
  FORGE_DEFAULT_STARTUP_COMMAND,
  isValidServerJar,
  normalizeJavaVersion,
  resolveStartupCommand,
  startupPresetsFor,
  checkStartupHeapLimit,
  type JavaVersion,
} from "@msm/shared";
import {
  Button,
  Col,
  Dropdown,
  Form,
  Nav,
  Row,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { copyText } from "../utils";
import { CATEGORIES, type CategoryId } from "./server-settings/settings-fields";
import { SettingsGeneralPanel } from "./server-settings/SettingsGeneralPanel";
import { SettingsWorldPanel } from "./server-settings/SettingsWorldPanel";
import { SettingsGameplayPanel } from "./server-settings/SettingsGameplayPanel";
import { SettingsNetworkPanel } from "./server-settings/SettingsNetworkPanel";
import { SettingsPerformancePanel } from "./server-settings/SettingsPerformancePanel";
import { SettingsStartupPanel } from "./server-settings/SettingsStartupPanel";

interface Props {
  server: ServerDetail;
  onSaved: (server: ServerDetail) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  canUpdateSettings?: boolean;
  canUpdateStartup?: boolean;
}

export function ServerSettings({
  server,
  onSaved,
  onError,
  onNotice,
  canUpdateSettings = true,
  canUpdateStartup = true,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const settingsEditable = canUpdateSettings;
  const startupEditable = canUpdateStartup;
  const memoryCapMb =
    isAdmin || !user || user.maxMemoryMb == null
      ? null
      : Math.max(
          server.memoryMb,
          user.maxMemoryMb - ((user.memoryUsedMb ?? 0) - server.memoryMb),
        );
  const [category, setCategory] = useState<CategoryId>("general");
  const [saving, setSaving] = useState(false);
  const [hasIcon, setHasIcon] = useState(server.hasIcon);

  const [name, setName] = useState(server.name);
  const [memoryMb, setMemoryMb] = useState(server.memoryMb);
  const [diskMb, setDiskMb] = useState(server.diskMb ?? 10_240);
  const [cpuLimit, setCpuLimit] = useState(server.cpuLimit ?? 0);
  const [port, setPort] = useState(server.port);
  const [autoRestart, setAutoRestart] = useState(server.autoRestart);
  const [startOnBoot, setStartOnBoot] = useState(server.startOnBoot);
  const [ownerAlertWebhookUrl, setOwnerAlertWebhookUrl] = useState(
    server.ownerAlertWebhookUrl ?? "",
  );
  const [ownerAlertEmail, setOwnerAlertEmail] = useState(
    server.ownerAlertEmail ?? "",
  );
  const [discordStatusWebhookUrl, setDiscordStatusWebhookUrl] = useState(
    server.discordStatusWebhookUrl ?? "",
  );
  const [discordStatusEnabled, setDiscordStatusEnabled] = useState(
    server.discordStatusEnabled ?? false,
  );
  const [bluemapUrl, setBluemapUrl] = useState(server.bluemapUrl ?? "");
  const [javaVersion, setJavaVersion] = useState<JavaVersion>(
    normalizeJavaVersion(server.javaVersion ?? server.javaPath),
  );
  const [startupCommand, setStartupCommand] = useState(
    server.startupCommand?.trim() ||
      (server.type === "FORGE" || server.type === "NEOFORGE"
        ? FORGE_DEFAULT_STARTUP_COMMAND
        : DEFAULT_STARTUP_COMMAND),
  );
  const [serverJar, setServerJar] = useState(
    server.serverJar?.trim() || DEFAULT_SERVER_JAR,
  );
  const [extraMounts, setExtraMounts] = useState<ServerExtraMount[]>(
    () => server.extraMounts ?? [],
  );
  const [ownerId, setOwnerId] = useState<string>(server.ownerId ?? "");
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [props, setProps] = useState<ServerProperties>({ ...server.properties });

  const [connect, setConnect] = useState<ConnectInfo | null>(null);
  const [packInfo, setPackInfo] = useState<{
    hasPack: boolean;
    sizeBytes: number;
    sha1: string | null;
    publicUrl: string;
    resourcePackUrl: string;
  } | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  useEffect(() => {
    setName(server.name);
    setMemoryMb(server.memoryMb);
    setDiskMb(server.diskMb ?? 10_240);
    setCpuLimit(server.cpuLimit ?? 0);
    setPort(server.port);
    setAutoRestart(server.autoRestart);
    setStartOnBoot(server.startOnBoot);
    setOwnerAlertWebhookUrl(server.ownerAlertWebhookUrl ?? "");
    setOwnerAlertEmail(server.ownerAlertEmail ?? "");
    setDiscordStatusWebhookUrl(server.discordStatusWebhookUrl ?? "");
    setDiscordStatusEnabled(server.discordStatusEnabled ?? false);
    setBluemapUrl(server.bluemapUrl ?? "");
    setJavaVersion(normalizeJavaVersion(server.javaVersion ?? server.javaPath));
    setStartupCommand(
      server.startupCommand?.trim() ||
        (server.type === "FORGE" || server.type === "NEOFORGE"
          ? FORGE_DEFAULT_STARTUP_COMMAND
          : DEFAULT_STARTUP_COMMAND),
    );
    setServerJar(server.serverJar?.trim() || DEFAULT_SERVER_JAR);
    setExtraMounts(server.extraMounts ?? []);
    setOwnerId(server.ownerId ?? "");
    setProps({ ...server.properties });
    setHasIcon(server.hasIcon);
  }, [server]);

  useEffect(() => {
    if (!isAdmin) return;
    void api
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [isAdmin]);

  useEffect(() => {
    void api
      .getConnectInfo(server.id)
      .then(setConnect)
      .catch(() =>
        setConnect({
          host: "localhost",
          port: server.port,
          address: `localhost:${server.port}`,
          motd: server.properties.motd ?? "",
          maxPlayers: server.properties["max-players"] ?? "20",
          onlineMode: server.properties["online-mode"] !== "false",
          whitelistEnabled: server.properties["white-list"] === "true",
          mcVersion: server.mcVersion,
          onlinePlayers: 0,
          playersMax: Number(server.properties["max-players"] ?? 20) || 20,
          serverStatus: server.status,
        }),
      );
  }, [server.id, server.port, server.properties]);

  useEffect(() => {
    if (category !== "network") return;
    void api
      .getResourcePack(server.id)
      .then((info) =>
        setPackInfo({
          hasPack: info.hasPack,
          sizeBytes: info.sizeBytes,
          sha1: info.sha1,
          publicUrl: info.publicUrl,
          resourcePackUrl: info.resourcePackUrl,
        }),
      )
      .catch(() => setPackInfo(null));
  }, [category, server.id]);

  function setProp(key: string, value: string) {
    setProps((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canSaveCategory) return;
    setSaving(true);
    onError(null);
    try {
      const updated = await api.updateServer(server.id, {
        name,
        ...(isAdmin ? { memoryMb, diskMb, cpuLimit } : {}),
        port,
        properties: props,
        autoRestart,
        startOnBoot,
        ownerAlertWebhookUrl: ownerAlertWebhookUrl.trim() || null,
        ownerAlertEmail: ownerAlertEmail.trim() || null,
        discordStatusWebhookUrl: discordStatusWebhookUrl.trim() || null,
        discordStatusEnabled,
        bluemapUrl: bluemapUrl.trim() || null,
        ...(startupEditable
          ? {
              javaVersion,
              serverJar: serverJar.trim() || DEFAULT_SERVER_JAR,
              startupCommand: (() => {
                const trimmed = startupCommand.trim();
                const typeDefault =
                  server.type === "FORGE" || server.type === "NEOFORGE"
                    ? FORGE_DEFAULT_STARTUP_COMMAND
                    : DEFAULT_STARTUP_COMMAND;
                return trimmed === typeDefault.trim() ? null : trimmed || null;
              })(),
            }
          : {}),
        ...(settingsEditable
          ? {
              extraMounts: extraMounts.map((m) => ({
                host: m.host.trim(),
                container: m.container.trim(),
                ...(m.readOnly ? { readOnly: true } : {}),
              })),
            }
          : {}),
        ...(isAdmin ? { ownerId: ownerId || null } : {}),
      });
      onSaved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyAddress() {
    const address = connect?.address ?? `:${port}`;
    try {
      await copyText(address);
      onNotice?.(`Copied ${address}`);
    } catch {
      onError("Could not copy address");
    }
  }

  async function onUploadPack(file: File | null) {
    if (!file) return;
    setPackBusy(true);
    onError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api.uploadResourcePack(server.id, form);
      setPackInfo({
        hasPack: true,
        sizeBytes: result.sizeBytes,
        sha1: result.sha1,
        publicUrl: result.publicUrl,
        resourcePackUrl: result.publicUrl,
      });
      setProp("resource-pack", result.publicUrl);
      setProp("resource-pack-sha1", result.sha1);
      onNotice?.("Resource pack uploaded.");
      const refreshed = await api.getServer(server.id);
      onSaved(refreshed);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPackBusy(false);
    }
  }

  async function onDeletePack() {
    if (!confirm("Remove the uploaded resource pack?")) return;
    setPackBusy(true);
    onError(null);
    try {
      await api.deleteResourcePack(server.id);
      setPackInfo((prev) =>
        prev
          ? { ...prev, hasPack: false, sha1: null, sizeBytes: 0, resourcePackUrl: "" }
          : prev,
      );
      setProp("resource-pack", "");
      setProp("resource-pack-sha1", "");
      setProp("require-resource-pack", "false");
      onNotice?.("Resource pack removed.");
      const refreshed = await api.getServer(server.id);
      onSaved(refreshed);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPackBusy(false);
    }
  }

  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const canSaveCategory =
    category === "general" || category === "performance"
      ? settingsEditable || startupEditable
      : category === "startup"
        ? startupEditable || settingsEditable
        : settingsEditable;

  const jarOk = isValidServerJar(serverJar.trim() || DEFAULT_SERVER_JAR);
  const isForgeType = server.type === "FORGE" || server.type === "NEOFORGE";
  const startupPresets = startupPresetsFor(server.type);
  const resolvedStartupPreview = resolveStartupCommand(
    startupCommand,
    memoryMb,
    serverJar.trim() || DEFAULT_SERVER_JAR,
  );
  const heapCheck = checkStartupHeapLimit(
    startupCommand,
    memoryMb,
    serverJar.trim() || DEFAULT_SERVER_JAR,
  );

  return (
    <Row className="g-4">
      <Col xs={12} lg={3}>
        <div className="settings-nav-wrap">
          <div className="d-lg-none mb-1">
            <Dropdown className="card-section-menu">
              <Dropdown.Toggle
                variant="outline-secondary"
                className="w-100 d-flex align-items-center justify-content-between"
                id="settings-section-menu"
              >
                <span className="d-flex align-items-center gap-2 min-w-0">
                  <i className="fa-solid fa-bars" aria-hidden />
                  <i className={`fa-solid ${activeCategory.icon}`} aria-hidden />
                  <span className="text-truncate">{activeCategory.label}</span>
                </span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="w-100">
                {CATEGORIES.map((c) => (
                  <Dropdown.Item
                    key={c.id}
                    active={category === c.id}
                    onClick={() => setCategory(c.id)}
                  >
                    <div className="d-flex align-items-start gap-2">
                      <i className={`fa-solid ${c.icon} mt-1`} />
                      <div className="min-w-0">
                        <div className="fw-semibold">{c.label}</div>
                        <div className="small text-secondary text-wrap">{c.hint}</div>
                      </div>
                    </div>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>
          <Nav variant="pills" className="settings-nav gap-1 d-none d-lg-flex flex-column">
            {CATEGORIES.map((c) => (
              <Nav.Link
                key={c.id}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
                className="text-start"
              >
                <div className="fw-semibold">
                  <i className={`fa-solid ${c.icon} me-2`} />
                  {c.label}
                </div>
                <div className="small opacity-75 settings-nav-hint">{c.hint}</div>
              </Nav.Link>
            ))}
          </Nav>
        </div>
      </Col>

      <Col xs={12} lg={9}>
        <div className="mb-3 d-none d-lg-block">
          <h2 className="h5 mb-1">{activeCategory.label}</h2>
          <p className="text-secondary small mb-0">{activeCategory.hint}</p>
        </div>
        <div className="mb-3 d-lg-none">
          <p className="text-secondary small mb-0">{activeCategory.hint}</p>
        </div>

          <Form onSubmit={onSave}>
            {category === "general" && (
              <SettingsGeneralPanel
                server={server}
                connect={connect}
                port={port}
                setPort={setPort}
                name={name}
                setName={setName}
                props={props}
                setProp={setProp}
                autoRestart={autoRestart}
                setAutoRestart={setAutoRestart}
                startOnBoot={startOnBoot}
                setStartOnBoot={setStartOnBoot}
                ownerId={ownerId}
                setOwnerId={setOwnerId}
                users={users}
                isAdmin={isAdmin}
                settingsEditable={settingsEditable}
                startupEditable={startupEditable}
                ownerAlertWebhookUrl={ownerAlertWebhookUrl}
                setOwnerAlertWebhookUrl={setOwnerAlertWebhookUrl}
                ownerAlertEmail={ownerAlertEmail}
                setOwnerAlertEmail={setOwnerAlertEmail}
                discordStatusWebhookUrl={discordStatusWebhookUrl}
                setDiscordStatusWebhookUrl={setDiscordStatusWebhookUrl}
                discordStatusEnabled={discordStatusEnabled}
                setDiscordStatusEnabled={setDiscordStatusEnabled}
                hasIcon={hasIcon}
                setHasIcon={setHasIcon}
                onSaved={onSaved}
                onError={onError}
                onNotice={onNotice}
                onCopyAddress={() => void copyAddress()}
              />
            )}

            {category === "world" && (
              <SettingsWorldPanel
                server={server}
                props={props}
                setProp={setProp}
                settingsEditable={settingsEditable}
                onNotice={onNotice}
                onError={onError}
              />
            )}

            {category === "gameplay" && (
              <SettingsGameplayPanel
                props={props}
                setProp={setProp}
                settingsEditable={settingsEditable}
              />
            )}

            {category === "network" && (
              <SettingsNetworkPanel
                server={server}
                props={props}
                setProp={setProp}
                settingsEditable={settingsEditable}
                packInfo={packInfo}
                packBusy={packBusy}
                onUploadPack={(file) => void onUploadPack(file)}
                onDeletePack={() => void onDeletePack()}
                onNotice={onNotice}
                onError={onError}
                onSaved={onSaved}
                setConnect={setConnect}
              />
            )}

            {category === "performance" && (
              <SettingsPerformancePanel
                props={props}
                setProp={setProp}
                memoryMb={memoryMb}
                setMemoryMb={setMemoryMb}
                diskMb={diskMb}
                setDiskMb={setDiskMb}
                cpuLimit={cpuLimit}
                setCpuLimit={setCpuLimit}
                memoryCapMb={memoryCapMb}
                isAdmin={isAdmin}
                settingsEditable={settingsEditable}
                startupEditable={startupEditable}
              />
            )}

            {category === "startup" && (
              <SettingsStartupPanel
                server={server}
                javaVersion={javaVersion}
                setJavaVersion={setJavaVersion}
                serverJar={serverJar}
                setServerJar={setServerJar}
                startupCommand={startupCommand}
                setStartupCommand={setStartupCommand}
                startupEditable={startupEditable}
                settingsEditable={settingsEditable}
                extraMounts={extraMounts}
                setExtraMounts={setExtraMounts}
                isForgeType={isForgeType}
                jarOk={jarOk}
                startupPresets={startupPresets}
                resolvedStartupPreview={resolvedStartupPreview}
                heapCheck={heapCheck}
                memoryMb={memoryMb}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              className="mt-2"
              disabled={
                saving ||
                !canSaveCategory ||
                (category === "startup" &&
                  startupEditable &&
                  (!jarOk || !heapCheck.ok))
              }
            >
              {saving ? "Saving…" : "Save category"}
            </Button>
          </Form>
      </Col>
    </Row>
  );
}
