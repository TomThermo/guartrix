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
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { useAuth } from "../../auth";
import { copyText } from "../../utils";
import type { CategoryId } from "./settings-fields";

export function useServerSettings({
  server,
  onSaved,
  onError,
  onNotice,
  canUpdateSettings = true,
  canUpdateStartup = true,
}: {
  server: ServerDetail;
  onSaved: (server: ServerDetail) => void;
  onError: (message: string | null) => void;
  onNotice?: (message: string | null) => void;
  canUpdateSettings?: boolean;
  canUpdateStartup?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const settingsEditable = canUpdateSettings;
  const startupEditable = canUpdateStartup;
  const memoryCapMb =
    isAdmin || !user || user.maxMemoryMb == null
      ? null
      : Math.max(server.memoryMb, user.maxMemoryMb - ((user.memoryUsedMb ?? 0) - server.memoryMb));
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
  const [ownerAlertEmail, setOwnerAlertEmail] = useState(server.ownerAlertEmail ?? "");
  const [discordStatusWebhookUrl, setDiscordStatusWebhookUrl] = useState(
    server.discordStatusWebhookUrl ?? "",
  );
  const [discordStatusEnabled, setDiscordStatusEnabled] = useState(
    server.discordStatusEnabled ?? false,
  );
  const [bluemapUrl, setBluemapUrl] = useState(server.bluemapUrl ?? "");
  const [javaVersion, setJavaVersion] = useState<JavaVersion>(
    normalizeJavaVersion(server.javaVersion),
  );
  const [startupCommand, setStartupCommand] = useState(
    server.startupCommand?.trim() ||
      (server.type === "FORGE" || server.type === "NEOFORGE"
        ? FORGE_DEFAULT_STARTUP_COMMAND
        : DEFAULT_STARTUP_COMMAND),
  );
  const [serverJar, setServerJar] = useState(server.serverJar?.trim() || DEFAULT_SERVER_JAR);
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
    setJavaVersion(normalizeJavaVersion(server.javaVersion));
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
  }, [server.id, server.port, server.properties, server.mcVersion, server.status]);

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

  const canSaveCategory =
    category === "general" || category === "performance"
      ? settingsEditable || startupEditable
      : category === "startup"
        ? startupEditable || settingsEditable
        : settingsEditable;

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
        ...(isAdmin && settingsEditable
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
      onError(t("common.copyAddressFailed"));
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
        prev ? { ...prev, hasPack: false, sha1: null, sizeBytes: 0, resourcePackUrl: "" } : prev,
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

  return {
    t,
    isAdmin,
    settingsEditable,
    startupEditable,
    memoryCapMb,
    category,
    setCategory,
    saving,
    hasIcon,
    setHasIcon,
    name,
    setName,
    memoryMb,
    setMemoryMb,
    diskMb,
    setDiskMb,
    cpuLimit,
    setCpuLimit,
    port,
    setPort,
    autoRestart,
    setAutoRestart,
    startOnBoot,
    setStartOnBoot,
    ownerAlertWebhookUrl,
    setOwnerAlertWebhookUrl,
    ownerAlertEmail,
    setOwnerAlertEmail,
    discordStatusWebhookUrl,
    setDiscordStatusWebhookUrl,
    discordStatusEnabled,
    setDiscordStatusEnabled,
    bluemapUrl,
    setBluemapUrl,
    javaVersion,
    setJavaVersion,
    startupCommand,
    setStartupCommand,
    serverJar,
    setServerJar,
    extraMounts,
    setExtraMounts,
    ownerId,
    setOwnerId,
    users,
    props,
    setProp,
    connect,
    setConnect,
    packInfo,
    packBusy,
    canSaveCategory,
    onSave,
    copyAddress,
    onUploadPack,
    onDeletePack,
    jarOk,
    isForgeType,
    startupPresets,
    resolvedStartupPreview,
    heapCheck,
  };
}
