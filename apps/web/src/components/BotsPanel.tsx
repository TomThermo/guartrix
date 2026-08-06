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
import { BotCommandForm } from "./bots/BotCommandForm";
import { buildBotCommand, type CmdType } from "./bots/buildBotCommand";

interface Props {
  serverId: string;
  serverRunning: boolean;
  onlineMode: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

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
      .catch((err) => onError(err instanceof Error ? err.message : t("bots.loadFailed")))
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

  async function sendCommand() {
    if (!broadcast && !selected) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const body = buildBotCommand({
        cmdType,
        sayText,
        yaw,
        pitch,
        gotoMode,
        playerName,
        gotoX,
        gotoY,
        gotoZ,
        itemName,
        chopLog,
        guardRadius,
        aiPrompt,
      });
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

      <BotCommandForm
        bots={bots}
        selected={selected}
        onSelectedChange={setSelected}
        broadcast={broadcast}
        onBroadcastChange={setBroadcast}
        cmdType={cmdType}
        onCmdTypeChange={setCmdType}
        aiPrompt={aiPrompt}
        onAiPromptChange={setAiPrompt}
        sayText={sayText}
        onSayTextChange={setSayText}
        yaw={yaw}
        onYawChange={setYaw}
        pitch={pitch}
        onPitchChange={setPitch}
        gotoMode={gotoMode}
        onGotoModeChange={setGotoMode}
        gotoX={gotoX}
        onGotoXChange={setGotoX}
        gotoY={gotoY}
        onGotoYChange={setGotoY}
        gotoZ={gotoZ}
        onGotoZChange={setGotoZ}
        playerName={playerName}
        onPlayerNameChange={setPlayerName}
        onlineHumans={onlineHumans}
        itemName={itemName}
        onItemNameChange={setItemName}
        chopLog={chopLog}
        onChopLogChange={setChopLog}
        guardRadius={guardRadius}
        onGuardRadiusChange={setGuardRadius}
        busy={busy}
        onSubmit={() => void sendCommand()}
      />
    </Stack>
  );
}
