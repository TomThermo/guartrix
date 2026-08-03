import { useCallback, useEffect, useMemo, useState } from "react";
import type { BotCommandRequest, BotInfo, BotStatus } from "@msm/shared";
import {
  Badge,
  Button,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  serverId: string;
  serverRunning: boolean;
  onlineMode: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

type CmdType = BotCommandRequest["type"];

function statusVariant(status: BotStatus): string {
  switch (status) {
    case "online":
      return "success";
    case "connecting":
      return "warning";
    case "error":
      return "danger";
    default:
      return "secondary";
  }
}

const AI_HINTS =
  'Examples: "wander", "stop", "follow Steve", "chop birch_log", "goto Steve", "guard 8", "attack", "dig stone"';

/** All vanilla logs / stems bots can chop (dropdown). */
const CHOP_LOG_OPTIONS: { value: string; label: string }[] = [
  { value: "oak_log", label: "Oak log" },
  { value: "spruce_log", label: "Spruce log" },
  { value: "birch_log", label: "Birch log" },
  { value: "jungle_log", label: "Jungle log" },
  { value: "acacia_log", label: "Acacia log" },
  { value: "dark_oak_log", label: "Dark oak log" },
  { value: "mangrove_log", label: "Mangrove log" },
  { value: "cherry_log", label: "Cherry log" },
  { value: "pale_oak_log", label: "Pale oak log" },
  { value: "crimson_stem", label: "Crimson stem" },
  { value: "warped_stem", label: "Warped stem" },
  { value: "stripped_oak_log", label: "Stripped oak log" },
  { value: "stripped_spruce_log", label: "Stripped spruce log" },
  { value: "stripped_birch_log", label: "Stripped birch log" },
  { value: "stripped_jungle_log", label: "Stripped jungle log" },
  { value: "stripped_acacia_log", label: "Stripped acacia log" },
  { value: "stripped_dark_oak_log", label: "Stripped dark oak log" },
  { value: "stripped_mangrove_log", label: "Stripped mangrove log" },
  { value: "stripped_cherry_log", label: "Stripped cherry log" },
  { value: "stripped_pale_oak_log", label: "Stripped pale oak log" },
  { value: "stripped_crimson_stem", label: "Stripped crimson stem" },
  { value: "stripped_warped_stem", label: "Stripped warped stem" },
];

export function BotsPanel({
  serverId,
  serverRunning,
  onlineMode,
  onError,
  onNotice,
}: Props) {
  const { t } = useI18n();
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(10);
  const [selected, setSelected] = useState<string>("");
  const [broadcast, setBroadcast] = useState(false);
  const [cmdType, setCmdType] = useState<CmdType>("ai");
  const [aiPrompt, setAiPrompt] = useState("wander");
  const [sayText, setSayText] = useState("Hello from Guartrix");
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [gotoX, setGotoX] = useState(0);
  const [gotoY, setGotoY] = useState(64);
  const [gotoZ, setGotoZ] = useState(0);
  /** coords = manual x/y/z, player = take position from an online player */
  const [gotoMode, setGotoMode] = useState<"coords" | "player">("player");
  const [playerName, setPlayerName] = useState("");
  const [itemName, setItemName] = useState("oak_log");
  const [chopLog, setChopLog] = useState("birch_log");
  const [guardRadius, setGuardRadius] = useState(8);
  const [onlineHumans, setOnlineHumans] = useState<string[]>([]);

  const botNames = useMemo(
    () => new Set(bots.map((b) => b.username.toLowerCase())),
    [bots],
  );

  const refresh = useCallback(async () => {
    const data = await api.listBots(serverId);
    setBots(data.bots);
    setSelected((prev) => {
      if (prev && data.bots.some((b) => b.username === prev)) return prev;
      return data.bots[0]?.username ?? "";
    });
  }, [serverId]);

  const refreshPlayers = useCallback(async () => {
    try {
      const [online, botList] = await Promise.all([
        api.getOnlinePlayers(serverId),
        api.listBots(serverId),
      ]);
      const botSet = new Set(botList.bots.map((b) => b.username.toLowerCase()));
      // Keep bot list in sync when we already fetched it
      setBots(botList.bots);
      setSelected((prev) => {
        if (prev && botList.bots.some((b) => b.username === prev)) return prev;
        return botList.bots[0]?.username ?? "";
      });
      const humans = online.players
        .map((p) => p.name)
        .filter((name) => !botSet.has(name.toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      setOnlineHumans(humans);
      setPlayerName((prev) => {
        if (prev && humans.some((h) => h.toLowerCase() === prev.toLowerCase())) {
          return prev;
        }
        return humans[0] ?? "";
      });
    } catch {
      // keep last known list
    }
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : "Failed to load bots"))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  // Live bot status/activity: fast while connecting, steady while online
  useEffect(() => {
    if (!serverRunning && bots.length === 0) return;
    const connecting = bots.some((b) => b.status === "connecting");
    const intervalMs = connecting || busy ? 400 : 1000;
    const t = setInterval(() => {
      void refresh().catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(t);
  }, [bots, refresh, serverRunning, busy]);

  useEffect(() => {
    void refreshPlayers();
    if (!serverRunning) return;
    const t = setInterval(() => void refreshPlayers(), 5000);
    return () => clearInterval(t);
  }, [refreshPlayers, serverRunning]);

  const onlineCount = bots.filter((b) => b.status === "online").length;
  const connectingCount = bots.filter((b) => b.status === "connecting").length;

  async function spawn() {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const data = await api.spawnBots(serverId, { count });
      // Show every bot as connecting immediately — join status streams in via poll
      setBots(data.bots);
      setSelected((prev) => prev || data.bots[0]?.username || "");
      onNotice(
        `Spawning ${data.bots.length} bot(s) — status updates live as each joins.`,
      );
      void refreshPlayers();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not spawn bots");
    } finally {
      setBusy(false);
    }
  }

  async function stopAll() {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.stopAllBots(serverId);
      onNotice("All bots stopped.");
      await refresh();
      await refreshPlayers();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not stop bots");
    } finally {
      setBusy(false);
    }
  }

  async function followPlayer(all: boolean) {
    const name = playerName.trim();
    if (!name) {
      onError("No online player selected (bots are filtered out of this list).");
      return;
    }
    if (botNames.has(name.toLowerCase())) {
      onError("Cannot follow a bot — pick a real player.");
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const body: BotCommandRequest = { type: "follow", player: name };
      await api.botCommand(serverId, all ? "*" : selected, body);
      onNotice(
        all
          ? `All bots following ${name} — updates live per bot.`
          : `${selected} is following ${name}.`,
      );
      void refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Follow failed");
    } finally {
      setBusy(false);
    }
  }

  function buildCommand(): BotCommandRequest {
    switch (cmdType) {
      case "say":
        return { type: "say", text: sayText };
      case "look":
        return { type: "look", yaw, pitch };
      case "quit":
        return { type: "quit" };
      case "stop":
        return { type: "stop" };
      case "jump":
        return { type: "jump" };
      case "goto":
        if (gotoMode === "player") {
          const name = playerName.trim();
          if (!name) throw new Error("Select an online player for goto");
          return { type: "goto", player: name };
        }
        return { type: "goto", x: gotoX, y: gotoY, z: gotoZ };
      case "follow":
        return { type: "follow", player: playerName.trim() };
      case "attack":
        return playerName.trim()
          ? { type: "attack", player: playerName.trim() }
          : { type: "attack" };
      case "collect":
        return {
          type: "collect",
          item: itemName.trim() || undefined,
          count: 16,
        };
      case "chop":
        return {
          type: "chop",
          block: chopLog || "birch_log",
        };
      case "dig":
        return {
          type: "dig",
          block: itemName.trim() || undefined,
        };
      case "wander":
        return { type: "wander" };
      case "guard":
        return { type: "guard", radius: guardRadius };
      case "ai":
        return { type: "ai", prompt: aiPrompt };
      default: {
        const _e: never = cmdType;
        throw new Error(`Unknown type ${_e}`);
      }
    }
  }

  async function sendCommand() {
    if (!broadcast && !selected) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const body = buildCommand();
      if (body.type === "follow" && botNames.has(body.player.toLowerCase())) {
        throw new Error("Cannot follow a bot — pick a real online player.");
      }
      if (
        body.type === "goto" &&
        body.player &&
        botNames.has(body.player.toLowerCase())
      ) {
        throw new Error("Cannot goto a bot — pick a real online player.");
      }
      const target = broadcast ? "*" : selected;
      const result = await api.botCommand(serverId, target, body);
      if (result.bots) setBots(result.bots);
      else if (result.bot) {
        setBots((prev) =>
          prev.map((b) => (b.username === result.bot!.username ? result.bot! : b)),
        );
      }
      onNotice(
        body.type === "quit"
          ? broadcast
            ? "All bots disconnecting…"
            : `${selected} disconnected.`
          : broadcast
            ? `Command queued for all bots — activity updates live.`
            : `Command sent to ${selected}.`,
      );
      void refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-secondary">
        <Spinner size="sm" className="me-2" /> {t("common.loading")}…
      </div>
    );
  }

  return (
    <Stack gap={3}>
      <h2 className="h5 mb-0">{t("bots.title")}</h2>
      <div>
        <p className="text-secondary mb-2">
          Admin Mineflayer bots: spawn them idle, then give orders (pathfinding +
          simple AI prompts). Requires <strong>offline-mode</strong>. On 26.x,
          Via* translates bots as 1.21.x.
        </p>
        {onlineMode && (
          <p className="text-warning small mb-0">
            <i className="fa-solid fa-triangle-exclamation me-1" />
            online-mode is on — turn it off and restart before spawning.
          </p>
        )}
        {!serverRunning && (
          <p className="text-warning small mb-0">
            <i className="fa-solid fa-triangle-exclamation me-1" />
            Server is not running.
          </p>
        )}
      </div>

      <Row className="g-2 align-items-end">
        <Col xs="auto">
          <Form.Group controlId="bot-count">
            <Form.Label className="small mb-1">Count</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
              style={{ width: 88 }}
              disabled={busy}
            />
          </Form.Group>
        </Col>
        <Col xs="auto">
          <Button
            variant="primary"
            disabled={busy || !serverRunning || onlineMode}
            onClick={() => void spawn()}
          >
            <i className="fa-solid fa-robot me-1" />
            Spawn idle bots
          </Button>
        </Col>
        <Col xs="auto">
          <Button
            variant="outline-danger"
            disabled={busy || bots.length === 0}
            onClick={() => void stopAll()}
          >
            Stop all
          </Button>
        </Col>
      </Row>

      <div className="border rounded p-3">
        <h3 className="h6 mb-2">
          <i className="fa-solid fa-person-walking me-1" />
          Follow player
        </h3>
        <p className="small text-secondary mb-2">
          Online players only — bots are filtered out. Stand near the bots so they
          can see you in loaded chunks.
        </p>
        <Row className="g-2 align-items-end">
          <Col md={4}>
            <Form.Group controlId="follow-player">
              <Form.Label className="small mb-1">Online player</Form.Label>
              <Form.Select
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                disabled={busy || onlineHumans.length === 0}
              >
                {onlineHumans.length === 0 ? (
                  <option value="">No real players online</option>
                ) : (
                  onlineHumans.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col xs="auto">
            <Button
              variant="success"
              disabled={busy || !playerName || bots.length === 0}
              onClick={() => void followPlayer(true)}
            >
              All bots follow
            </Button>
          </Col>
          <Col xs="auto">
            <Button
              variant="outline-success"
              disabled={busy || !playerName || !selected}
              onClick={() => void followPlayer(false)}
            >
              Selected bot follows
            </Button>
          </Col>
          <Col xs="auto">
            <Button
              variant="outline-secondary"
              disabled={busy || bots.length === 0}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  onError(null);
                  try {
                    await api.botCommand(serverId, "*", { type: "stop" });
                    onNotice("All bots stopped moving.");
                    await refresh();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : "Stop failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Stop following
            </Button>
          </Col>
        </Row>
      </div>

      <div>
        <h3 className="h6 d-flex align-items-center gap-2 flex-wrap">
          <span>Active bots ({bots.length})</span>
          {connectingCount > 0 && (
            <Badge bg="warning" text="dark">
              <Spinner animation="border" size="sm" className="me-1" />
              {connectingCount} joining…
            </Badge>
          )}
          {onlineCount > 0 && (
            <Badge bg="success">{onlineCount} online</Badge>
          )}
        </h3>
        <ListGroup>
          {bots.length === 0 && (
            <ListGroup.Item className="text-secondary">{t("bots.empty")}</ListGroup.Item>
          )}
          {bots.map((b) => (
            <ListGroup.Item
              key={b.username}
              action
              active={selected === b.username}
              onClick={() => setSelected(b.username)}
              className="d-flex justify-content-between align-items-start gap-2"
            >
              <div className="min-w-0">
                <div className="fw-semibold">
                  {b.username}
                  {b.status === "connecting" && (
                    <Spinner
                      animation="border"
                      size="sm"
                      className="ms-2"
                      style={{ width: "0.75rem", height: "0.75rem" }}
                    />
                  )}
                </div>
                {b.activity && (
                  <div className="small text-secondary text-truncate">
                    {b.activity}
                  </div>
                )}
                {b.error && (
                  <div className="small text-danger text-truncate">{b.error}</div>
                )}
              </div>
              <Badge bg={statusVariant(b.status)}>{b.status}</Badge>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </div>

      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void sendCommand();
        }}
        className="border rounded p-3 bg-body-tertiary"
      >
        <h3 className="h6 mb-1">Orders</h3>
        <p className="small text-secondary mb-3">{AI_HINTS}</p>
        <Row className="g-2 align-items-end">
          <Col md={3}>
            <Form.Group controlId="bot-target">
              <Form.Label className="small mb-1">Bot</Form.Label>
              <Form.Select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={busy || bots.length === 0 || broadcast}
              >
                {bots.length === 0 && <option value="">—</option>}
                {bots.map((b) => (
                  <option key={b.username} value={b.username}>
                    {b.username}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group controlId="bot-cmd">
              <Form.Label className="small mb-1">Action</Form.Label>
              <Form.Select
                value={cmdType}
                onChange={(e) => setCmdType(e.target.value as CmdType)}
                disabled={busy}
              >
                <option value="ai">ai (free text)</option>
                <option value="wander">wander</option>
                <option value="stop">stop</option>
                <option value="follow">follow</option>
                <option value="goto">goto</option>
                <option value="chop">chop (until stop)</option>
                <option value="collect">collect</option>
                <option value="dig">dig</option>
                <option value="attack">attack</option>
                <option value="guard">guard</option>
                <option value="jump">jump</option>
                <option value="say">say</option>
                <option value="look">look</option>
                <option value="quit">quit</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={3} className="d-flex align-items-end pb-1">
            <Form.Check
              type="checkbox"
              id="bot-broadcast"
              label="Send to all bots"
              checked={broadcast}
              onChange={(e) => setBroadcast(e.target.checked)}
              disabled={busy || bots.length === 0}
            />
          </Col>
        </Row>

        <Row className="g-2 align-items-end mt-2">
          {cmdType === "ai" && (
            <Col md={8}>
              <Form.Group controlId="bot-ai">
                <Form.Label className="small mb-1">AI prompt</Form.Label>
                <Form.Control
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="chop birch_log / follow Steve / stop"
                  disabled={busy}
                />
              </Form.Group>
            </Col>
          )}
          {cmdType === "say" && (
            <Col md={6}>
              <Form.Control
                value={sayText}
                onChange={(e) => setSayText(e.target.value)}
                disabled={busy}
                placeholder="Chat message"
              />
            </Col>
          )}
          {cmdType === "look" && (
            <>
              <Col md={2}>
                <Form.Control
                  type="number"
                  step="0.1"
                  value={yaw}
                  onChange={(e) => setYaw(Number(e.target.value))}
                  disabled={busy}
                  placeholder="yaw"
                />
              </Col>
              <Col md={2}>
                <Form.Control
                  type="number"
                  step="0.1"
                  value={pitch}
                  onChange={(e) => setPitch(Number(e.target.value))}
                  disabled={busy}
                  placeholder="pitch"
                />
              </Col>
            </>
          )}
          {cmdType === "goto" && (
            <>
              <Col md={3}>
                <Form.Select
                  value={gotoMode}
                  onChange={(e) =>
                    setGotoMode(e.target.value as "coords" | "player")
                  }
                  disabled={busy}
                >
                  <option value="player">Online player</option>
                  <option value="coords">Coordinates</option>
                </Form.Select>
              </Col>
              {gotoMode === "player" ? (
                <Col md={4}>
                  <Form.Select
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    disabled={busy || onlineHumans.length === 0}
                  >
                    {onlineHumans.length === 0 ? (
                      <option value="">No real players online</option>
                    ) : (
                      onlineHumans.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    )}
                  </Form.Select>
                  <Form.Text className="text-secondary">
                    Bots walk to that player&apos;s current position (must be
                    visible to them).
                  </Form.Text>
                </Col>
              ) : (
                <>
                  <Col md={2}>
                    <Form.Control
                      type="number"
                      value={gotoX}
                      onChange={(e) => setGotoX(Number(e.target.value))}
                      disabled={busy}
                      placeholder="x"
                    />
                  </Col>
                  <Col md={2}>
                    <Form.Control
                      type="number"
                      value={gotoY}
                      onChange={(e) => setGotoY(Number(e.target.value))}
                      disabled={busy}
                      placeholder="y"
                    />
                  </Col>
                  <Col md={2}>
                    <Form.Control
                      type="number"
                      value={gotoZ}
                      onChange={(e) => setGotoZ(Number(e.target.value))}
                      disabled={busy}
                      placeholder="z"
                    />
                  </Col>
                </>
              )}
            </>
          )}
          {(cmdType === "follow" || cmdType === "attack") && (
            <Col md={4}>
              <Form.Select
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                disabled={busy}
              >
                {cmdType === "attack" && <option value="">Nearest mob</option>}
                {onlineHumans.length === 0 && cmdType === "follow" && (
                  <option value="">No real players online</option>
                )}
                {onlineHumans.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Form.Select>
            </Col>
          )}
          {cmdType === "chop" && (
            <Col md={4}>
              <Form.Group controlId="bot-chop-log">
                <Form.Label className="small mb-1">Log type</Form.Label>
                <Form.Select
                  value={chopLog}
                  onChange={(e) => setChopLog(e.target.value)}
                  disabled={busy}
                >
                  {CHOP_LOG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-secondary">
                  Keeps chopping this wood until you press Stop. Bots take
                  different trees.
                </Form.Text>
              </Form.Group>
            </Col>
          )}
          {(cmdType === "collect" || cmdType === "dig") && (
            <Col md={4}>
              <Form.Control
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                disabled={busy}
                placeholder={
                  cmdType === "dig"
                    ? "Block name (optional)"
                    : "Item/block e.g. oak_log"
                }
              />
            </Col>
          )}
          {cmdType === "guard" && (
            <Col md={2}>
              <Form.Control
                type="number"
                min={2}
                max={32}
                value={guardRadius}
                onChange={(e) => setGuardRadius(Number(e.target.value) || 8)}
                disabled={busy}
                placeholder="radius"
              />
            </Col>
          )}
          <Col xs="auto">
            <Button
              type="submit"
              variant="primary"
              disabled={busy || (!broadcast && !selected)}
            >
              <i className="fa-solid fa-paper-plane me-1" />
              Send
            </Button>
          </Col>
        </Row>
      </Form>
    </Stack>
  );
}
