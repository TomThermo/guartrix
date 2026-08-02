import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type {
  AuthUser,
  ConnectInfo,
  ServerDetail,
  ServerProperties,
} from "@msm/shared";
import {
  DEFAULT_SERVER_JAR,
  DEFAULT_STARTUP_COMMAND,
  FORGE_DEFAULT_STARTUP_COMMAND,
  JAVA_VERSIONS,
  isValidServerJar,
  normalizeJavaVersion,
  resolveStartupCommand,
  startupPresetsFor,
  checkStartupHeapLimit,
  type JavaVersion,
} from "@msm/shared";
import {
  Alert,
  Button,
  Card,
  Col,
  Dropdown,
  Form,
  Nav,
  Row,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { copyText } from "../utils";
import { MemorySelect } from "./MemorySelect";
import { ServerIconField } from "./ServerIconField";
import { WorldToolsCard } from "./WorldToolsCard";

type CategoryId =
  | "general"
  | "world"
  | "gameplay"
  | "network"
  | "performance"
  | "startup";

const CATEGORIES: { id: CategoryId; label: string; hint: string; icon: string }[] = [
  {
    id: "general",
    label: "General",
    hint: "Name, MOTD, icon, players, authentication",
    icon: "fa-sliders",
  },
  {
    id: "world",
    label: "World",
    hint: "Seed, difficulty, gamemode, dimensions",
    icon: "fa-globe",
  },
  {
    id: "gameplay",
    label: "Gameplay",
    hint: "PvP, spawn, flight, command blocks",
    icon: "fa-gamepad",
  },
  {
    id: "network",
    label: "Access",
    hint: "Online-mode, resource pack, proxy",
    icon: "fa-shield-halved",
  },
  {
    id: "performance",
    label: "Performance",
    hint: "RAM, view distance, simulation",
    icon: "fa-gauge-high",
  },
  {
    id: "startup",
    label: "Start Configuration",
    hint: "Java version and startup command",
    icon: "fa-terminal",
  },
];

function bool(v: string | undefined, fallback = false): string {
  if (v === "true" || v === "false") return v;
  return fallback ? "true" : "false";
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Form.Group className="settings-field">
      <div className="settings-field-head">
        <Form.Label className="settings-field-label">{label}</Form.Label>
        <div className="settings-field-hint">{hint || "\u00A0"}</div>
      </div>
      {children}
    </Form.Group>
  );
}

function BoolSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Form.Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="true">Enabled</option>
      <option value="false">Disabled</option>
    </Form.Select>
  );
}

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
    setJavaVersion(normalizeJavaVersion(server.javaVersion ?? server.javaPath));
    setStartupCommand(
      server.startupCommand?.trim() ||
        (server.type === "FORGE" || server.type === "NEOFORGE"
          ? FORGE_DEFAULT_STARTUP_COMMAND
          : DEFAULT_STARTUP_COMMAND),
    );
    setServerJar(server.serverJar?.trim() || DEFAULT_SERVER_JAR);
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
        ? startupEditable
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
              <>
                <Card className="border mb-3">
                  <Card.Body className="py-3">
                    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                      <div>
                        <div className="fw-semibold mb-1">
                          <i className="fa-solid fa-plug me-2" />
                          Connect
                        </div>
                        <div className="font-monospace">
                          {connect?.address ?? `:${port}`}
                        </div>
                        {(connect?.motd || props.motd) && (
                          <div className="small text-secondary mt-1">
                            MOTD: {connect?.motd || props.motd}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="outline-primary" onClick={() => void copyAddress()}>
                        <i className="fa-solid fa-copy me-1" />
                        Copy address
                      </Button>
                    </div>
                  </Card.Body>
                </Card>

                {connect?.sftpEnabled && connect.sftpHost && (
                  <Card className="border mb-3">
                    <Card.Body className="py-3">
                      <div className="fw-semibold mb-1">
                        <i className="fa-solid fa-folder-open me-2" />
                        SFTP Configuration
                      </div>
                      <p className="small text-secondary mb-3">
                        Account details for SFTP connections to this server&apos;s files.
                        Use <strong>SFTP</strong> (not FTP or FTPS). The password is your
                        panel account password.
                      </p>
                      <dl className="row small mb-0">
                        <dt className="col-sm-3 text-secondary">Host</dt>
                        <dd className="col-sm-9">
                          <code className="user-select-all">sftp://{connect.sftpHost}</code>
                          <Button
                            size="sm"
                            variant="link"
                            className="py-0"
                            onClick={() =>
                              void copyText(connect.sftpHost!)
                            }
                          >
                            Copy
                          </Button>
                        </dd>
                        <dt className="col-sm-3 text-secondary">Port</dt>
                        <dd className="col-sm-9">
                          <code className="user-select-all">{connect.sftpPort ?? 2022}</code>
                        </dd>
                        <dt className="col-sm-3 text-secondary">Username</dt>
                        <dd className="col-sm-9">
                          <code className="user-select-all">{connect.sftpUsername}</code>
                          <Button
                            size="sm"
                            variant="link"
                            className="py-0"
                            onClick={() =>
                              void copyText(
                                connect.sftpUsername ?? "",
                              )
                            }
                          >
                            Copy
                          </Button>
                        </dd>
                        <dt className="col-sm-3 text-secondary">Password</dt>
                        <dd className="col-sm-9 text-secondary">
                          Your Guartrix panel password
                        </dd>
                      </dl>
                    </Card.Body>
                  </Card>
                )}

                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Display name" hint="Shown in Guartrix">
                      <Form.Control value={name} onChange={(e) => setName(e.target.value)} required disabled={!settingsEditable} />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="MOTD" hint="Message of the day in the multiplayer list">
                      <Form.Control
                        value={props.motd ?? ""}
                        onChange={(e) => setProp("motd", e.target.value)}
                        disabled={!settingsEditable}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Max players" hint="Player slots">
                      <Form.Control
                        type="number"
                        min={1}
                        max={1000}
                        value={props["max-players"] ?? "20"}
                        onChange={(e) => setProp("max-players", e.target.value)}
                        disabled={!settingsEditable}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Port" hint="Requires stop to change">
                      <Form.Control
                        type="number"
                        min={1024}
                        max={65535}
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        disabled={!startupEditable}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Online mode" hint="Verify accounts with Mojang/Microsoft">
                      <BoolSelect
                        id="online-mode"
                        value={bool(props["online-mode"], true)}
                        onChange={(v) => setProp("online-mode", v)}
                        disabled={!settingsEditable}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Show in server list" hint="Respond to multiplayer pings">
                      <BoolSelect
                        id="enable-status"
                        value={bool(props["enable-status"], true)}
                        onChange={(v) => setProp("enable-status", v)}
                        disabled={!settingsEditable}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Hide online players" hint="Hide sample player names in ping">
                      <BoolSelect
                        id="hide-online-players"
                        value={bool(props["hide-online-players"])}
                        onChange={(v) => setProp("hide-online-players", v)}
                        disabled={!settingsEditable}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Auto-restart" hint="Restart if the process exits unexpectedly">
                      <Form.Select
                        value={autoRestart ? "true" : "false"}
                        onChange={(e) => setAutoRestart(e.target.value === "true")}
                        disabled={!startupEditable}
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </Form.Select>
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Start on boot" hint="Start this server when Guartrix starts">
                      <Form.Select
                        value={startOnBoot ? "true" : "false"}
                        onChange={(e) => setStartOnBoot(e.target.value === "true")}
                        disabled={!startupEditable}
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </Form.Select>
                    </Field>
                  </Col>
                  <Col md={6}>
                    {isAdmin ? (
                      <Field
                        label="Owner"
                        hint="Only this user (and admins) can manage the server"
                      >
                        <Form.Select
                          value={ownerId}
                          onChange={(e) => setOwnerId(e.target.value)}
                        >
                          <option value="">— Unassigned —</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}
                            </option>
                          ))}
                        </Form.Select>
                      </Field>
                    ) : (
                      <Field label="Owner" hint="Account that owns this server">
                        <Form.Control
                          value={server.ownerUsername ?? "—"}
                          disabled
                          readOnly
                        />
                      </Field>
                    )}
                  </Col>
                </Row>
                <div className="mb-3">
                  <Field label="Server icon" hint="Multiplayer list icon">
                    {settingsEditable ? (
                      <ServerIconField
                        serverId={server.id}
                        hasIcon={hasIcon}
                        onChanged={(next) => {
                          setHasIcon(next);
                          onSaved({ ...server, hasIcon: next });
                        }}
                        onError={onError}
                        onNotice={onNotice}
                      />
                    ) : (
                      <Form.Control value={hasIcon ? "Custom icon set" : "Default icon"} disabled readOnly />
                    )}
                  </Field>
                </div>
              </>
            )}

            {category === "world" && (
              <fieldset disabled={!settingsEditable} className="settings-fieldset">
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Level name" hint="World folder name">
                      <Form.Control
                        value={props["level-name"] ?? "world"}
                        onChange={(e) => setProp("level-name", e.target.value)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Level type" hint="minecraft:normal, flat, large_biomes…">
                      <Form.Control
                        value={props["level-type"] ?? "minecraft:normal"}
                        onChange={(e) => setProp("level-type", e.target.value)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Seed" hint="Empty = random on first start">
                      <Form.Control
                        value={props["level-seed"] ?? ""}
                        onChange={(e) => setProp("level-seed", e.target.value)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Max world size" hint="Blocks from center">
                      <Form.Control
                        type="number"
                        value={props["max-world-size"] ?? "29999984"}
                        onChange={(e) => setProp("max-world-size", e.target.value)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Difficulty" hint="Peaceful to Hard">
                      <Form.Select
                        value={props.difficulty ?? "easy"}
                        onChange={(e) => setProp("difficulty", e.target.value)}
                      >
                        <option value="peaceful">Peaceful</option>
                        <option value="easy">Easy</option>
                        <option value="normal">Normal</option>
                        <option value="hard">Hard</option>
                      </Form.Select>
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Default gamemode" hint="New players">
                      <Form.Select
                        value={props.gamemode ?? "survival"}
                        onChange={(e) => setProp("gamemode", e.target.value)}
                      >
                        <option value="survival">Survival</option>
                        <option value="creative">Creative</option>
                        <option value="adventure">Adventure</option>
                        <option value="spectator">Spectator</option>
                      </Form.Select>
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Hardcore" hint="One life, bans on death">
                      <BoolSelect
                        id="hardcore"
                        value={bool(props.hardcore)}
                        onChange={(v) => setProp("hardcore", v)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Force gamemode" hint="Always use default gamemode">
                      <BoolSelect
                        id="force-gamemode"
                        value={bool(props["force-gamemode"])}
                        onChange={(v) => setProp("force-gamemode", v)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Generate structures" hint="Villages, strongholds…">
                      <BoolSelect
                        id="generate-structures"
                        value={bool(props["generate-structures"], true)}
                        onChange={(v) => setProp("generate-structures", v)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Allow Nether" hint="Nether dimension portals">
                      <BoolSelect
                        id="allow-nether"
                        value={bool(props["allow-nether"], true)}
                        onChange={(v) => setProp("allow-nether", v)}
                      />
                    </Field>
                  </Col>
                </Row>
                <WorldToolsCard
                  server={server}
                  canEdit={settingsEditable}
                  onNotice={(m) => onNotice?.(m)}
                  onError={onError}
                />
              </fieldset>
            )}

            {category === "gameplay" && (
              <fieldset disabled={!settingsEditable} className="settings-fieldset">
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="PvP" hint="Player versus player">
                      <BoolSelect
                        id="pvp"
                        value={bool(props.pvp, true)}
                        onChange={(v) => setProp("pvp", v)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Allow flight" hint="Creative-style flight in survival">
                      <BoolSelect
                        id="allow-flight"
                        value={bool(props["allow-flight"])}
                        onChange={(v) => setProp("allow-flight", v)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Spawn protection" hint="Blocks around spawn (0 = off)">
                      <Form.Control
                        type="number"
                        min={0}
                        value={props["spawn-protection"] ?? "16"}
                        onChange={(e) => setProp("spawn-protection", e.target.value)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Player idle timeout (min)" hint="0 = disabled">
                      <Form.Control
                        type="number"
                        min={0}
                        value={props["player-idle-timeout"] ?? "0"}
                        onChange={(e) => setProp("player-idle-timeout", e.target.value)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Spawn monsters" hint="Hostile mobs">
                      <BoolSelect
                        id="spawn-monsters"
                        value={bool(props["spawn-monsters"], true)}
                        onChange={(v) => setProp("spawn-monsters", v)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Spawn animals" hint="Passive mobs">
                      <BoolSelect
                        id="spawn-animals"
                        value={bool(props["spawn-animals"], true)}
                        onChange={(v) => setProp("spawn-animals", v)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Spawn NPCs" hint="Villagers">
                      <BoolSelect
                        id="spawn-npcs"
                        value={bool(props["spawn-npcs"], true)}
                        onChange={(v) => setProp("spawn-npcs", v)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Command blocks" hint="Enable command blocks">
                      <BoolSelect
                        id="enable-command-block"
                        value={bool(props["enable-command-block"])}
                        onChange={(v) => setProp("enable-command-block", v)}
                      />
                    </Field>
                  </Col>
                </Row>
              </fieldset>
            )}

            {category === "network" && (
              <fieldset disabled={!settingsEditable} className="settings-fieldset">
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Prevent proxy connections" hint="Block VPNs / proxies">
                      <BoolSelect
                        id="prevent-proxy-connections"
                        value={bool(props["prevent-proxy-connections"])}
                        onChange={(v) => setProp("prevent-proxy-connections", v)}
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Require resource pack" hint="Kick if pack declined">
                      <BoolSelect
                        id="require-resource-pack"
                        value={bool(props["require-resource-pack"])}
                        onChange={(v) => setProp("require-resource-pack", v)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={6}>
                    <Field label="Resource pack URL" hint="https://…">
                      <Form.Control
                        value={props["resource-pack"] ?? ""}
                        onChange={(e) => setProp("resource-pack", e.target.value)}
                        placeholder="https://…"
                      />
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field label="Resource pack SHA-1" hint="Optional hash">
                      <Form.Control
                        value={props["resource-pack-sha1"] ?? ""}
                        onChange={(e) => setProp("resource-pack-sha1", e.target.value)}
                      />
                    </Field>
                  </Col>
                </Row>
                <Row className="g-3 mb-1">
                  <Col md={12}>
                    <Field label="Resource pack prompt" hint="Message shown to players">
                      <Form.Control
                        value={props["resource-pack-prompt"] ?? ""}
                        onChange={(e) => setProp("resource-pack-prompt", e.target.value)}
                      />
                    </Field>
                  </Col>
                </Row>

                <Alert variant="light" className="border mb-3">
                  <div className="fw-semibold mb-2">
                    <i className="fa-solid fa-box-open me-2" />
                    Upload resource pack
                  </div>
                  <p className="small text-secondary mb-2">
                    Upload a <code>.zip</code> pack. Guartrix hosts it and sets URL + SHA-1
                    automatically.
                  </p>
                  {packInfo?.hasPack && (
                    <div className="small mb-2">
                      <div>
                        SHA-1: <code className="user-select-all">{packInfo.sha1}</code>
                      </div>
                      <div className="text-break">
                        URL: <code className="user-select-all">{packInfo.publicUrl}</code>
                      </div>
                      <div className="text-secondary">
                        {(packInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  )}
                  <Stack direction="horizontal" gap={2} className="flex-wrap">
                    {settingsEditable && (
                      <>
                        <Form.Control
                          type="file"
                          accept=".zip,application/zip"
                          disabled={packBusy}
                          style={{ maxWidth: 280 }}
                          onChange={(e) => {
                            const input = e.target as HTMLInputElement;
                            const file = input.files?.[0] ?? null;
                            void onUploadPack(file);
                            input.value = "";
                          }}
                        />
                        {packInfo?.hasPack && (
                          <Button
                            size="sm"
                            variant="outline-danger"
                            disabled={packBusy}
                            onClick={() => void onDeletePack()}
                          >
                            Delete pack
                          </Button>
                        )}
                      </>
                    )}
                  </Stack>
                </Alert>

                <p className="small text-secondary mb-3">
                  Manage whitelist players under <strong>Whitelist Manager</strong> in the side menu.
                </p>
              </fieldset>
            )}

            {category === "performance" && (
              <>
                <fieldset disabled={!startupEditable} className="settings-fieldset border-0 p-0 mb-1">
                  <Row className="g-3 mb-1">
                    <Col md={6}>
                      <Field
                        label="Memory"
                        hint={
                          isAdmin
                            ? "Java heap (-Xmx). Restart to apply."
                            : "Java heap (-Xmx). Only an admin can change this."
                        }
                      >
                        <MemorySelect
                          valueMb={memoryMb}
                          onChangeMb={setMemoryMb}
                          maxMb={memoryCapMb}
                          disabled={!startupEditable || !isAdmin}
                        />
                      </Field>
                    </Col>
                    <Col md={6}>
                      <Field
                        label="Disk limit"
                        hint={
                          isAdmin
                            ? "Max storage for this server’s files."
                            : "Max storage for this server. Only an admin can change this."
                        }
                      >
                        <MemorySelect
                          valueMb={diskMb}
                          onChangeMb={setDiskMb}
                          disabled={!startupEditable || !isAdmin}
                        />
                      </Field>
                    </Col>
                  </Row>
                  <Row className="g-3 mb-1">
                    <Col md={6}>
                      <Field
                        label="CPU limit"
                        hint={
                          isAdmin
                            ? "100 = 1 CPU core. Restart to apply."
                            : "CPU cap. Only an admin can change this."
                        }
                      >
                        <Form.Select
                          value={cpuLimit}
                          onChange={(e) => setCpuLimit(Number(e.target.value))}
                          disabled={!startupEditable || !isAdmin}
                        >
                          <option value={0}>Unlimited</option>
                          <option value={50}>0.5 core (50%)</option>
                          <option value={100}>1 core (100%)</option>
                          <option value={200}>2 cores (200%)</option>
                          <option value={400}>4 cores (400%)</option>
                          <option value={800}>8 cores (800%)</option>
                        </Form.Select>
                      </Field>
                    </Col>
                  </Row>
                </fieldset>
                <fieldset disabled={!settingsEditable} className="settings-fieldset border-0 p-0">
                  <Row className="g-3 mb-1">
                    <Col md={6}>
                      <Field label="Sync chunk writes" hint="Safer disk writes">
                        <BoolSelect
                          id="sync-chunk-writes"
                          value={bool(props["sync-chunk-writes"], true)}
                          onChange={(v) => setProp("sync-chunk-writes", v)}
                        />
                      </Field>
                    </Col>
                  </Row>
                  <Row className="g-3 mb-1">
                    <Col md={6}>
                      <Field label="View distance" hint="Chunks sent to clients">
                        <Form.Control
                          type="number"
                          min={2}
                          max={128}
                          value={props["view-distance"] ?? "10"}
                          onChange={(e) => setProp("view-distance", e.target.value)}
                        />
                      </Field>
                    </Col>
                    <Col md={6}>
                      <Field label="Simulation distance" hint="Chunks that tick">
                        <Form.Control
                          type="number"
                          min={2}
                          max={128}
                          value={props["simulation-distance"] ?? "10"}
                          onChange={(e) => setProp("simulation-distance", e.target.value)}
                        />
                      </Field>
                    </Col>
                  </Row>
                  <Row className="g-3 mb-1">
                    <Col md={6}>
                      <Field label="Network compression" hint="-1 off, 256 default">
                        <Form.Control
                          type="number"
                          value={props["network-compression-threshold"] ?? "256"}
                          onChange={(e) =>
                            setProp("network-compression-threshold", e.target.value)
                          }
                        />
                      </Field>
                    </Col>
                    <Col md={6}>
                      <Field label="Max tick time (ms)" hint="-1 disables watchdog">
                        <Form.Control
                          type="number"
                          value={props["max-tick-time"] ?? "60000"}
                          onChange={(e) => setProp("max-tick-time", e.target.value)}
                        />
                      </Field>
                    </Col>
                  </Row>
                </fieldset>
              </>
            )}

            {category === "startup" && (
              <fieldset disabled={!startupEditable} className="settings-fieldset border-0 p-0">
                <Alert variant="light" className="border small mb-3">
                  Manage the startup command and Java version for this server.
                  Placeholders: <code>{"{{MEMORY}}"}</code> (RAM in MB)
                  {!isForgeType ? (
                    <>
                      , <code>{"{{JAR}}"}</code> (default <code>server.jar</code>)
                    </>
                  ) : null}
                  . Restart the server to apply changes.
                  {isForgeType ? (
                    <div className="mt-2 mb-0">
                      Forge/NeoForge starts with <code>run.sh</code>. JVM flags from the
                      template are written to <code>user_jvm_args.txt</code> (
                      <code>-jar</code> / <code>nogui</code> are ignored).
                    </div>
                  ) : null}
                </Alert>

                <Row className="g-3 mb-3">
                  <Col md={6}>
                    <Field
                      label="Java version"
                      hint="Java runtime used when this server starts"
                    >
                      <Form.Select
                        value={javaVersion}
                        onChange={(e) =>
                          setJavaVersion(normalizeJavaVersion(e.target.value))
                        }
                        disabled={!startupEditable}
                      >
                        {JAVA_VERSIONS.map((j) => (
                          <option key={j.version} value={j.version}>
                            {j.label}
                          </option>
                        ))}
                      </Form.Select>
                    </Field>
                  </Col>
                  <Col md={6}>
                    <Field
                      label="Server Jar File"
                      hint="Jar filename in the server directory (e.g. server.jar or paper-1.21.jar)"
                    >
                      <Form.Control
                        className="font-monospace"
                        value={serverJar}
                        onChange={(e) => setServerJar(e.target.value)}
                        placeholder={DEFAULT_SERVER_JAR}
                        required
                        isInvalid={startupEditable && !jarOk}
                        disabled={!startupEditable || isForgeType}
                      />
                      <Form.Control.Feedback type="invalid">
                        Must end with .jar (letters, digits, . _ - only)
                      </Form.Control.Feedback>
                    </Field>
                  </Col>
                </Row>

                <Field
                  label={isForgeType ? "JVM args template" : "Startup command"}
                  hint={
                    isForgeType
                      ? "Flags only; written to user_jvm_args.txt on start"
                      : "Command used to start the server. {{JAR}} is replaced by Server Jar File."
                  }
                >
                  <Form.Control
                    as="textarea"
                    rows={4}
                    className="font-monospace small"
                    value={startupCommand}
                    onChange={(e) => setStartupCommand(e.target.value)}
                    disabled={!startupEditable}
                  />
                </Field>

                <div className="small text-secondary mb-2">
                  {server.type === "PAPER" || server.type === "PURPUR"
                    ? "Presets for Paper/Purpur: Default or Aikar’s G1GC."
                    : server.type === "VANILLA"
                      ? "Presets for Vanilla: Default or Performance (G1GC)."
                      : server.type === "FABRIC" || server.type === "QUILT"
                        ? "Presets for Fabric/Quilt: Default or Modded G1GC."
                        : isForgeType
                          ? "Presets for Forge/NeoForge: Default or Modded G1GC → user_jvm_args.txt."
                          : "Click a preset to fill the command, then Save."}{" "}
                  Click to fill, then Save.
                </div>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {startupPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant={
                        startupCommand.trim() === preset.command.trim()
                          ? "secondary"
                          : "outline-secondary"
                      }
                      disabled={!startupEditable}
                      title={preset.hint}
                      onClick={() => setStartupCommand(preset.command)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                <div className="small text-secondary mb-1">
                  {isForgeType
                    ? "Resolved JVM args (preview → user_jvm_args.txt)"
                    : "Resolved command (preview)"}
                </div>
                <pre className="bg-body-tertiary border rounded p-3 small font-monospace mb-0 text-break">
                  {resolvedStartupPreview}
                </pre>
                {!heapCheck.ok && heapCheck.error && (
                  <Alert variant="danger" className="small mt-3 mb-0">
                    {heapCheck.error}
                  </Alert>
                )}
                <Form.Text className="text-secondary d-block mt-2">
                  <code>-Xmx</code> / <code>-Xms</code> cannot exceed allocated RAM (
                  {memoryMb} MB). Prefer <code>{"{{MEMORY}}"}</code>.
                </Form.Text>
              </fieldset>
            )}

            <Button
              type="submit"
              variant="primary"
              className="mt-2"
              disabled={
                saving ||
                !canSaveCategory ||
                (category === "startup" && (!jarOk || !heapCheck.ok))
              }
            >
              {saving ? "Saving…" : "Save category"}
            </Button>
          </Form>
      </Col>
    </Row>
  );
}
