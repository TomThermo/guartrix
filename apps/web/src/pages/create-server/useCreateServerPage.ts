import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { canCreateServer, type DaemonNode, type ServerType } from "@guartrix/shared";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { formatGb } from "../../utils";
import { useCreateServerEffects } from "./useCreateServerEffects";

export type CreateServerMode = "create" | "import";

function parseCreateMode(value: string | null): CreateServerMode {
  return value === "import" ? "import" : "create";
}

export function useCreateServerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const mode = parseCreateMode(searchParams.get("mode"));
  const setMode = (next: CreateServerMode) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "create") p.delete("mode");
        else p.set("mode", next);
        return p;
      },
      { replace: true },
    );
  };
  const [name, setName] = useState("");
  const [type, setType] = useState<ServerType>("PAPER");
  const [mcVersion, setMcVersion] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [port, setPort] = useState(25565);
  const [portManuallyEdited, setPortManuallyEdited] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);
  const [portChecking, setPortChecking] = useState(false);
  const [memoryMb, setMemoryMb] = useState(2 * 1024);
  const [diskMb, setDiskMb] = useState(10 * 1024);
  const [cpuLimit, setCpuLimit] = useState(200);
  const [keepCount, setKeepCount] = useState(7);
  const [archive, setArchive] = useState<File | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<DaemonNode[]>([]);
  const [nodeId, setNodeId] = useState("");
  const [seed, setSeed] = useState("");
  const [gamemode, setGamemode] = useState("survival");
  const [difficulty, setDifficulty] = useState("easy");
  const [worldPreset, setWorldPreset] = useState<"DEFAULT" | "FLAT" | "VOID">("DEFAULT");

  const allowed = canCreateServer(user);
  const remainingRamMb =
    user?.role === "ADMIN" || user?.maxMemoryMb == null
      ? null
      : Math.max(0, user.maxMemoryMb - (user.memoryUsedMb ?? 0));
  const serversLeft =
    user?.role === "ADMIN" || user?.maxServers == null
      ? null
      : Math.max(0, user.maxServers - (user.serverCount ?? 0));

  const selectedNode = useMemo(() => nodes.find((n) => n.id === nodeId) ?? null, [nodes, nodeId]);

  const nodeRamOk =
    !selectedNode ||
    selectedNode.memoryMb <= 0 ||
    memoryMb <= (selectedNode.memoryUsableMb ?? selectedNode.memoryAvailableMb);

  const selectedFreeMb =
    selectedNode == null ? 0 : (selectedNode.memoryUsableMb ?? selectedNode.memoryAvailableMb);

  const submitDisabled =
    busy || !mcVersion || !nodeRamOk || !nodeId || !!portError || (mode === "import" && !archive);

  useCreateServerEffects({
    type,
    nodeId,
    port,
    portManuallyEdited,
    setPort,
    setPortError,
    setPortChecking,
    setPortManuallyEdited,
    setVersions,
    setMcVersion,
    setLoadingVersions,
    setError,
    setNodes,
    setNodeId,
    setKeepCount,
    t,
  });

  useEffect(() => {
    if (remainingRamMb == null) return;
    if (memoryMb <= remainingRamMb) return;
    const capped = Math.max(1024, Math.floor(remainingRamMb / 1024) * 1024);
    setMemoryMb(Math.min(capped, remainingRamMb) || 1024);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only clamp when quota changes
  }, [remainingRamMb, memoryMb]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (portError) {
      setError(portError);
      return;
    }
    if (!nodeRamOk) {
      setError(
        selectedNode
          ? t("createServer.notEnoughRam", {
              name: selectedNode.name,
              free: formatGb(selectedFreeMb),
            })
          : t("createServer.chooseNode"),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const server = await api.createServer({
        name,
        type,
        mcVersion,
        port,
        memoryMb,
        diskMb,
        cpuLimit,
        nodeId: nodeId || undefined,
        seed: seed.trim() || undefined,
        gamemode: gamemode as "survival" | "creative" | "adventure" | "spectator",
        difficulty: difficulty as "peaceful" | "easy" | "normal" | "hard",
        worldPreset,
        keepCount,
      });
      await refreshUser().catch(() => undefined);
      navigate(`/servers/${server.id}`, { state: { fromCreate: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createServer.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (portError) {
      setError(portError);
      return;
    }
    if (!archive) {
      setError(t("createServer.chooseArchive"));
      return;
    }
    if (!nodeRamOk) {
      setError(
        selectedNode
          ? t("createServer.notEnoughRam", {
              name: selectedNode.name,
              free: formatGb(selectedFreeMb),
            })
          : t("createServer.chooseNode"),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", archive);
      form.append("name", name);
      form.append("type", type);
      form.append("mcVersion", mcVersion);
      form.append("port", String(port));
      form.append("memoryMb", String(memoryMb));
      form.append("diskMb", String(diskMb));
      form.append("cpuLimit", String(cpuLimit));
      form.append("keepCount", String(keepCount));
      if (nodeId) form.append("nodeId", nodeId);
      const server = await api.importServer(form);
      await refreshUser().catch(() => undefined);
      navigate(`/servers/${server.id}`, { state: { fromCreate: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createServer.importFailed"));
    } finally {
      setBusy(false);
    }
  }

  return {
    t,
    allowed,
    mode,
    setMode,
    name,
    setName,
    type,
    setType,
    mcVersion,
    setMcVersion,
    versions,
    port,
    setPort,
    portManuallyEdited,
    setPortManuallyEdited,
    portError,
    portChecking,
    memoryMb,
    setMemoryMb,
    diskMb,
    setDiskMb,
    cpuLimit,
    setCpuLimit,
    keepCount,
    setKeepCount,
    archive,
    setArchive,
    loadingVersions,
    busy,
    error,
    setError,
    nodes,
    nodeId,
    setNodeId,
    seed,
    setSeed,
    gamemode,
    setGamemode,
    difficulty,
    setDifficulty,
    worldPreset,
    setWorldPreset,
    remainingRamMb,
    serversLeft,
    selectedNode,
    nodeRamOk,
    selectedFreeMb,
    submitDisabled,
    onCreate,
    onImport,
  };
}
