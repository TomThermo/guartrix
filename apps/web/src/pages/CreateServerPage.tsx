import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { canCreateServer, BACKUP_KEEP_COUNT_PRESETS, type DaemonNode, type ServerType } from "@msm/shared";
import {
  Button,
  Form,
  Nav,
  Spinner,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { MemorySelect } from "../components/MemorySelect";
import {
  AdminInsetCard,
  AdminPageShell,
  AdminPanelCard,
} from "../components/admin/AdminPageShell";
import { formatGb } from "../utils";
import { CreateServerForm } from "./create-server/CreateServerForm";
import { ImportServerForm } from "./create-server/ImportServerForm";
import { ServerTypeNodeFields } from "./create-server/ServerTypeNodeFields";

type Mode = "create" | "import";

export function CreateServerPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("create");
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
  const [worldPreset, setWorldPreset] = useState<"DEFAULT" | "FLAT" | "VOID">(
    "DEFAULT",
  );

  const allowed = canCreateServer(user);
  const remainingRamMb =
    user?.role === "ADMIN" || user?.maxMemoryMb == null
      ? null
      : Math.max(0, user.maxMemoryMb - (user.memoryUsedMb ?? 0));
  const serversLeft =
    user?.role === "ADMIN" || user?.maxServers == null
      ? null
      : Math.max(0, user.maxServers - (user.serverCount ?? 0));

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === nodeId) ?? null,
    [nodes, nodeId],
  );

  const nodeRamOk =
    !selectedNode ||
    selectedNode.memoryMb <= 0 ||
    memoryMb <= (selectedNode.memoryUsableMb ?? selectedNode.memoryAvailableMb);

  const selectedFreeMb =
    selectedNode == null
      ? 0
      : selectedNode.memoryUsableMb ?? selectedNode.memoryAvailableMb;

  const submitDisabled =
    busy || !mcVersion || !nodeRamOk || !nodeId || !!portError || (mode === "import" && !archive);

  useEffect(() => {
    void api
      .getCreateServerDefaults()
      .then(({ defaultBackupKeepCount }) => setKeepCount(defaultBackupKeepCount))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void api
      .listNodes()
      .then(({ nodes: list }) => {
        const ranked = [...list].sort((a, b) => {
          const aOnline = a.status === "ONLINE" ? 1 : 0;
          const bOnline = b.status === "ONLINE" ? 1 : 0;
          if (aOnline !== bOnline) return bOnline - aOnline;
          const aFree = a.memoryMb > 0 ? (a.memoryUsableMb ?? a.memoryAvailableMb) : -1;
          const bFree = b.memoryMb > 0 ? (b.memoryUsableMb ?? b.memoryAvailableMb) : -1;
          if (aFree !== bFree) return bFree - aFree;
          if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setNodes(ranked);
        const preferred =
          ranked.find(
            (n) =>
              n.status === "ONLINE" &&
              (n.memoryMb <= 0 || (n.memoryUsableMb ?? n.memoryAvailableMb) > 0),
          ) ??
          ranked.find((n) => n.isLocal) ??
          ranked.find((n) => n.status === "ONLINE") ??
          ranked[0];
        if (preferred) setNodeId(preferred.id);
      })
      .catch(() => setNodes([]));
  }, []);

  useEffect(() => {
    if (remainingRamMb == null) return;
    if (memoryMb <= remainingRamMb) return;
    const capped = Math.max(1024, Math.floor(remainingRamMb / 1024) * 1024);
    setMemoryMb(Math.min(capped, remainingRamMb) || 1024);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only clamp when quota changes
  }, [remainingRamMb]);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    api
      .versions(type)
      .then((res) => {
        if (cancelled) return;
        setVersions(res.versions);
        setMcVersion(res.versions[0] ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("createServer.versionsFailed"));
          setVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, t]);

  useEffect(() => {
    setPortManuallyEdited(false);
  }, [type]);

  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    void api
      .suggestedPort(nodeId, type)
      .then((res) => {
        if (cancelled || portManuallyEdited) return;
        setPort(res.port);
        setPortError(null);
      })
      .catch((err) => {
        if (!cancelled && !portManuallyEdited) {
          setPortError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, type, portManuallyEdited]);

  useEffect(() => {
    if (!nodeId || port < 1024 || port > 65535) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPortChecking(true);
      void api
        .checkNodePort(nodeId, port, type)
        .then((res) => {
          if (cancelled) return;
          if (!res.free) {
            setPortError(
              t("createServer.portInUse", {
                port: res.port,
                protocol: res.protocol.toUpperCase(),
              }),
            );
          } else {
            setPortError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setPortError(null);
        })
        .finally(() => {
          if (!cancelled) setPortChecking(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nodeId, port, type, t]);

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
        gamemode: gamemode as
          | "survival"
          | "creative"
          | "adventure"
          | "spectator",
        difficulty: difficulty as "peaceful" | "easy" | "normal" | "hard",
        worldPreset,
        keepCount,
      });
      await refreshUser().catch(() => undefined);
      navigate(`/servers/${server.id}`);
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
      navigate(`/servers/${server.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createServer.importFailed"));
    } finally {
      setBusy(false);
    }
  }

  const quotaChips =
    serversLeft != null || remainingRamMb != null ? (
      <div className="create-server-quota">
        {serversLeft != null && (
          <span className="account-status-chip is-off">
            {serversLeft === 1
              ? t("createServer.quotaServersLeft", { count: serversLeft })
              : t("createServer.quotaServersLeftPlural", { count: serversLeft })}
          </span>
        )}
        {remainingRamMb != null && (
          <span className="account-status-chip is-off">
            {t("createServer.quotaRamLeft", {
              gb: (remainingRamMb / 1024).toFixed(remainingRamMb % 1024 === 0 ? 0 : 1),
            })}
          </span>
        )}
      </div>
    ) : null;

  const resourcesCard = (
    <AdminPanelCard title={t("createServer.sectionResources")} icon="fa-gauge-high">
      <Form.Group className="mb-3" controlId="port">
        <Form.Label>{t("createServer.port")}</Form.Label>
        <Form.Control
          type="number"
          min={1024}
          max={65535}
          value={port}
          onChange={(e) => {
            setPortManuallyEdited(true);
            setPort(Number(e.target.value));
          }}
          isInvalid={!!portError}
          required
        />
        {portChecking && (
          <Form.Text className="text-secondary">{t("createServer.portChecking")}</Form.Text>
        )}
        {portError && (
          <Form.Control.Feedback type="invalid">{portError}</Form.Control.Feedback>
        )}
        {!portError && !portManuallyEdited && nodeId && (
          <Form.Text className="text-secondary">{t("createServer.portSuggested")}</Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3" controlId="memory">
        <Form.Label>{t("createServer.memory")}</Form.Label>
        <MemorySelect
          valueMb={memoryMb}
          onChangeMb={setMemoryMb}
          required
          maxMb={
            remainingRamMb != null && selectedNode && selectedNode.memoryMb > 0
              ? Math.min(remainingRamMb, selectedFreeMb)
              : remainingRamMb != null
                ? remainingRamMb
                : selectedNode && selectedNode.memoryMb > 0
                  ? selectedFreeMb
                  : undefined
          }
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="disk">
        <Form.Label>{t("createServer.disk")}</Form.Label>
        <MemorySelect valueMb={diskMb} onChangeMb={setDiskMb} required />
        <Form.Text className="text-secondary">{t("createServer.diskHelp")}</Form.Text>
      </Form.Group>

      <Form.Group className="mb-3" controlId="keepCount">
        <Form.Label>{t("createServer.backupKeepCount")}</Form.Label>
        <Form.Select value={keepCount} onChange={(e) => setKeepCount(Number(e.target.value))}>
          {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
            <option key={n} value={n}>
              {t("backups.backupsCount", { n })}
            </option>
          ))}
        </Form.Select>
        <Form.Text className="text-secondary">{t("createServer.backupKeepCountHelp")}</Form.Text>
      </Form.Group>

      <Form.Group className="mb-0" controlId="cpu">
        <Form.Label>{t("createServer.cpuLimit")}</Form.Label>
        <Form.Select value={cpuLimit} onChange={(e) => setCpuLimit(Number(e.target.value))}>
          <option value={0}>{t("createServer.unlimited")}</option>
          <option value={50}>0.5 core (50%)</option>
          <option value={100}>1 core (100%)</option>
          <option value={200}>2 cores (200%)</option>
          <option value={400}>4 cores (400%)</option>
          <option value={800}>8 cores (800%)</option>
        </Form.Select>
        <Form.Text className="text-secondary">{t("createServer.cpuLimitHelp")}</Form.Text>
      </Form.Group>
    </AdminPanelCard>
  );

  const submitButton =
    mode === "create" ? (
      <Button type="submit" variant="primary" disabled={submitDisabled}>
        {busy ? (
          <>
            <Spinner size="sm" className="me-2" />
            {type === "FORGE" || type === "NEOFORGE"
              ? t("createServer.installing")
              : t("createServer.creating")}
          </>
        ) : (
          <>
            <i className="fa-solid fa-download me-2" aria-hidden />
            {t("createServer.create")}
          </>
        )}
      </Button>
    ) : (
      <Button type="submit" variant="primary" disabled={submitDisabled}>
        {busy ? (
          <>
            <Spinner size="sm" className="me-2" />
            {t("createServer.importBusy")}
          </>
        ) : (
          <>
            <i className="fa-solid fa-file-import me-2" aria-hidden />
            {t("createServer.import")}
          </>
        )}
      </Button>
    );

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminPageShell
      className="create-server-page"
      title={t("createServer.title")}
      subtitle={t("createServer.subtitle")}
      icon="fa-plus"
      backTo="/"
      backLabel={t("common.cancel")}
      error={error}
      onDismissError={() => setError(null)}
    >
      {quotaChips}

      <Nav
        variant="pills"
        className="create-server-mode-nav"
        activeKey={mode}
        onSelect={(k) => k && setMode(k as Mode)}
      >
        <Nav.Item>
          <Nav.Link eventKey="create">
            <i className="fa-solid fa-plus" aria-hidden />
            {t("createServer.modeCreate")}
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="import">
            <i className="fa-solid fa-file-import" aria-hidden />
            {t("createServer.modeImport")}
          </Nav.Link>
        </Nav.Item>
      </Nav>

      <Form onSubmit={(e) => void (mode === "create" ? onCreate(e) : onImport(e))}>
        <div className="create-server-layout">
          <div className="create-server-stack">
            {mode === "import" && (
              <ImportServerForm onArchiveChange={setArchive} />
            )}
            <ServerTypeNodeFields
              name={name}
              onNameChange={setName}
              nodes={nodes}
              nodeId={nodeId}
              onNodeIdChange={setNodeId}
              selectedNode={selectedNode}
              nodeRamOk={nodeRamOk}
              selectedFreeMb={selectedFreeMb}
              memoryMb={memoryMb}
              type={type}
              onTypeChange={setType}
              mcVersion={mcVersion}
              onMcVersionChange={setMcVersion}
              versions={versions}
              loadingVersions={loadingVersions}
            />
            {mode === "create" && (
              <CreateServerForm
                worldPreset={worldPreset}
                onWorldPresetChange={setWorldPreset}
                seed={seed}
                onSeedChange={setSeed}
                gamemode={gamemode}
                onGamemodeChange={setGamemode}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
              />
            )}
          </div>

          <div className="create-server-side">
            {resourcesCard}
            <AdminInsetCard className="create-server-submit">{submitButton}</AdminInsetCard>
          </div>
        </div>
      </Form>
    </AdminPageShell>
  );
}
