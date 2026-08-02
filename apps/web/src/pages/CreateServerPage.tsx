import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ALL_SERVER_TYPES,
  canCreateServer,
  type DaemonNode,
  type ServerType,
} from "@msm/shared";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Nav,
  Row,
  Spinner,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { MemorySelect } from "../components/MemorySelect";
import { typeIcon, typeLabel, formatGb } from "../utils";

type Mode = "create" | "import";

export function CreateServerPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [type, setType] = useState<ServerType>("PAPER");
  const [mcVersion, setMcVersion] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [port, setPort] = useState(25565);
  const [memoryMb, setMemoryMb] = useState(2 * 1024);
  const [diskMb, setDiskMb] = useState(10 * 1024);
  const [cpuLimit, setCpuLimit] = useState(200);
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
    memoryMb <= selectedNode.memoryAvailableMb;

  useEffect(() => {
    void api
      .listNodes()
      .then(({ nodes: list }) => {
        setNodes(list);
        const preferred =
          list.find((n) => n.isLocal) ?? list.find((n) => n.status === "ONLINE") ?? list[0];
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
          setError(err instanceof Error ? err.message : "Failed to load versions");
          setVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!nodeRamOk) {
      setError(
        selectedNode
          ? `Not enough RAM on node "${selectedNode.name}": available ${formatGb(selectedNode.memoryAvailableMb)}`
          : "Choose a node",
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
      });
      await refreshUser().catch(() => undefined);
      navigate(`/servers/${server.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!archive) {
      setError("Choose an archive to import (.zip or .tar.gz)");
      return;
    }
    if (!nodeRamOk) {
      setError(
        selectedNode
          ? `Not enough RAM on node "${selectedNode.name}": available ${formatGb(selectedNode.memoryAvailableMb)}`
          : "Choose a node",
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
      if (nodeId) form.append("nodeId", nodeId);
      const server = await api.importServer(form);
      await refreshUser().catch(() => undefined);
      navigate(`/servers/${server.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const metaFields = (
    <>
      <Form.Group className="mb-3" controlId="name">
        <Form.Label>Name</Form.Label>
        <Form.Control
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={64}
          placeholder="Survival world"
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="node">
        <Form.Label>Node</Form.Label>
        <Form.Select
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          required={nodes.length > 0}
          disabled={nodes.length === 0}
        >
          {nodes.length === 0 && <option value="">No nodes available</option>}
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
              {n.isLocal ? " (local)" : ""}
              {n.memoryMb > 0
                ? ` — ${formatGb(n.memoryAvailableMb)} free / ${formatGb(n.memoryMb)}`
                : ""}
              {n.status !== "ONLINE" ? ` [${n.status}]` : ""}
            </option>
          ))}
        </Form.Select>
        {selectedNode && (
          <Form.Text
            className={nodeRamOk ? "text-secondary" : "text-danger"}
          >
            {selectedNode.memoryMb > 0 ? (
              nodeRamOk ? (
                <>
                  Node has {formatGb(selectedNode.memoryAvailableMb)} available
                  ({formatGb(selectedNode.memoryUsedMb)} of {formatGb(selectedNode.memoryMb)}{" "}
                  allocated).
                </>
              ) : (
                <>
                  Not enough RAM on this node: you requested {formatGb(memoryMb)}, available is{" "}
                  {formatGb(selectedNode.memoryAvailableMb)}.
                </>
              )
            ) : (
              <>Node capacity unknown — click Test connection under System.</>
            )}
          </Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Type</Form.Label>
        <div className="type-picker d-flex flex-wrap gap-2">
          {ALL_SERVER_TYPES.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={type === t ? "primary" : "outline-secondary"}
              className="type-picker-btn"
              onClick={() => setType(t)}
            >
              <i className={`fa-solid ${typeIcon(t)} me-1`} />
              {typeLabel(t)}
            </Button>
          ))}
        </div>
      </Form.Group>

      <Form.Group className="mb-3" controlId="version">
        <Form.Label>Minecraft version</Form.Label>
        <Form.Select
          value={mcVersion}
          onChange={(e) => setMcVersion(e.target.value)}
          disabled={loadingVersions || versions.length === 0}
          required
        >
          {loadingVersions && <option>Loading…</option>}
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {mode === "create" && (
        <Row className="g-3 mb-3">
          <Col md={6}>
            <Form.Group controlId="world-preset">
              <Form.Label>World preset</Form.Label>
              <Form.Select
                value={worldPreset}
                onChange={(e) =>
                  setWorldPreset(e.target.value as "DEFAULT" | "FLAT" | "VOID")
                }
              >
                <option value="DEFAULT">Default</option>
                <option value="FLAT">Superflat</option>
                <option value="VOID">Void</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="seed">
              <Form.Label>Seed (optional)</Form.Label>
              <Form.Control
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Random if empty"
                maxLength={128}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="gamemode">
              <Form.Label>Gamemode</Form.Label>
              <Form.Select
                value={gamemode}
                onChange={(e) => setGamemode(e.target.value)}
              >
                <option value="survival">Survival</option>
                <option value="creative">Creative</option>
                <option value="adventure">Adventure</option>
                <option value="spectator">Spectator</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="difficulty">
              <Form.Label>Difficulty</Form.Label>
              <Form.Select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="peaceful">Peaceful</option>
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
      )}

      <Row className="g-3 mb-3">
        <Col md={6}>
          <Form.Group controlId="port">
            <Form.Label>Port</Form.Label>
            <Form.Control
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="memory">
            <Form.Label>Memory</Form.Label>
            <MemorySelect
              valueMb={memoryMb}
              onChangeMb={setMemoryMb}
              required
              maxMb={
                remainingRamMb != null && selectedNode && selectedNode.memoryMb > 0
                  ? Math.min(remainingRamMb, selectedNode.memoryAvailableMb)
                  : remainingRamMb != null
                    ? remainingRamMb
                    : selectedNode && selectedNode.memoryMb > 0
                      ? selectedNode.memoryAvailableMb
                      : undefined
              }
            />
            {(serversLeft != null || remainingRamMb != null) && (
              <Form.Text className="text-secondary">
                {serversLeft != null && (
                  <span>
                    {serversLeft} server slot{serversLeft === 1 ? "" : "s"} left
                  </span>
                )}
                {serversLeft != null && remainingRamMb != null && " · "}
                {remainingRamMb != null && (
                  <span>
                    {(remainingRamMb / 1024).toFixed(
                      remainingRamMb % 1024 === 0 ? 0 : 1,
                    )}{" "}
                    GB RAM left in your pool
                  </span>
                )}
              </Form.Text>
            )}
          </Form.Group>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col md={6}>
          <Form.Group controlId="disk">
            <Form.Label>Disk limit</Form.Label>
            <MemorySelect valueMb={diskMb} onChangeMb={setDiskMb} required />
            <Form.Text className="text-secondary">
              Max storage for this server. Uploads are blocked and a running server
              may stop if this limit is exceeded.
            </Form.Text>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId="cpu">
            <Form.Label>CPU limit</Form.Label>
            <Form.Select
              value={cpuLimit}
              onChange={(e) => setCpuLimit(Number(e.target.value))}
            >
              <option value={0}>Unlimited</option>
              <option value={50}>0.5 core (50%)</option>
              <option value={100}>1 core (100%)</option>
              <option value={200}>2 cores (200%)</option>
              <option value={400}>4 cores (400%)</option>
              <option value={800}>8 cores (800%)</option>
            </Form.Select>
            <Form.Text className="text-secondary">
              100% equals one CPU core. Restart the server to apply a new limit.
            </Form.Text>
          </Form.Group>
        </Col>
      </Row>
    </>
  );

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">
            <i className="fa-solid fa-plus me-2 text-primary" />
            New server
          </h1>
          <p className="text-secondary mb-0">
            Download a jar or import an existing world archive.
          </p>
        </div>
        <Link to="/" className="btn btn-sm btn-outline-secondary">
          Cancel
        </Link>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-transparent">
          <Nav variant="tabs" activeKey={mode} onSelect={(k) => k && setMode(k as Mode)}>
            <Nav.Item>
              <Nav.Link eventKey="create">Create new</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="import">Import archive</Nav.Link>
            </Nav.Item>
          </Nav>
        </Card.Header>
        <Card.Body>
          {mode === "create" ? (
            <Form onSubmit={(e) => void onCreate(e)}>
              {metaFields}
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !mcVersion || !nodeRamOk || !nodeId}
              >
                {busy ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    {type === "FORGE" || type === "NEOFORGE"
                      ? "Installing (may take a minute)…"
                      : "Downloading jar & creating…"}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-download me-2" />
                    Create server
                  </>
                )}
              </Button>
            </Form>
          ) : (
            <Form onSubmit={(e) => void onImport(e)}>
              <Alert variant="light" className="border small mb-3">
                Upload a <code>.zip</code> or <code>.tar.gz</code> of an existing server folder
                (world, configs, mods/plugins). Set the correct type and Minecraft version so
                Guartrix can manage the jar.
              </Alert>
              <Form.Group className="mb-3" controlId="archive">
                <Form.Label>Archive</Form.Label>
                <Form.Control
                  type="file"
                  accept=".zip,.tar.gz,.tgz,application/zip,application/gzip"
                  required
                  onChange={(e) => {
                    const input = e.target as HTMLInputElement;
                    setArchive(input.files?.[0] ?? null);
                  }}
                />
              </Form.Group>
              {metaFields}
              <Button
                type="submit"
                variant="primary"
                disabled={busy || !mcVersion || !archive || !nodeRamOk || !nodeId}
              >
                {busy ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    Importing…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-file-import me-2" />
                    Import server
                  </>
                )}
              </Button>
            </Form>
          )}
        </Card.Body>
      </Card>
    </>
  );
}
