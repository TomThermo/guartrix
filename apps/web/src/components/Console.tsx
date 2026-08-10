import { useEffect, useRef, useState, type FormEvent, type UIEvent } from "react";
import type { ConsoleMessage, ServerStats, ServerStatus } from "@guartrix/shared";
import { Button, Form, InputGroup, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  serverId: string;
  onStatus?: (status: ServerStatus) => void;
  /** Live resource samples pushed over the console WebSocket. */
  onStats?: (stats: ServerStats) => void;
  /** When false, output is shown but the command form is hidden. */
  canSend?: boolean;
  /** Extra panel messages (e.g. license blocked start) shown as console error lines. */
  panelNotices?: string[];
}

const BOTTOM_THRESHOLD_PX = 48;
const RECONNECT_MIN_MS = 800;
const RECONNECT_MAX_MS = 15_000;

/** Panel polls `/list` for online players — hide that spam from the console. */
function isPlayersListLine(line: string): boolean {
  return /There are \d+ of a max of \d+ players online:/i.test(line);
}

type DaemonTone = "info" | "progress" | "ok" | "error" | "notice";

/** Optional Minecraft-style `[HH:MM:SS]` prefix from the daemon. */
const CONSOLE_CLOCK = /^\[\d{1,2}:\d{2}:\d{2}\]\s*/;

function stripConsoleClock(line: string): string {
  return line.replace(CONSOLE_CLOCK, "");
}

function daemonConsoleTone(line: string): DaemonTone | null {
  const body = stripConsoleClock(line);
  if (/^\[error\]/i.test(body)) return "error";
  if (
    /^container@guartrix~/i.test(body) ||
    /^openjdk version/i.test(body) ||
    /^OpenJDK /i.test(body)
  ) {
    return "info";
  }
  if (!/^\[Guartrix Daemon\]/i.test(body)) return null;

  const msg = body.replace(/^\[Guartrix Daemon\]\s*/i, "");
  if (/^NOTICE:/i.test(msg)) return "notice";
  if (/^ERROR:/i.test(msg)) return "error";
  if (
    /^Completed rebuild process/i.test(msg) ||
    /^Running server preflight/i.test(msg) ||
    /^Starting server container/i.test(msg) ||
    /^Console reattached/i.test(msg)
  ) {
    return "ok";
  }
  if (
    /^Rebuilding server container/i.test(msg) ||
    /^New container built/i.test(msg) ||
    /^Container is being initialized/i.test(msg) ||
    /^Checking size of server data directory/i.test(msg) ||
    /^Disk Usage:/i.test(msg) ||
    /^Ensuring correct ownership of files/i.test(msg) ||
    /^Force-killing Docker container/i.test(msg) ||
    /^Reattaching to running container/i.test(msg)
  ) {
    return "progress";
  }
  return "info";
}

function isNearBottom(el: HTMLElement, threshold = BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

export function Console({ serverId, onStatus, onStats, canSend = true, panelNotices = [] }: Props) {
  const { t } = useI18n();
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!canSend) return;
    void api
      .getConsoleFavorites(serverId)
      .then((r) => setFavorites(r.commands))
      .catch(() => setFavorites([]));
  }, [serverId, canSend]);

  async function persistFavorites(next: string[]) {
    setFavorites(next);
    try {
      const saved = await api.setConsoleFavorites(serverId, next);
      setFavorites(saved.commands);
    } catch {
      // keep local
    }
  }

  function addFavorite() {
    const cmd = command.trim().replace(/^\/+/, "");
    if (!cmd || favorites.includes(cmd)) return;
    void persistFavorites([...favorites, cmd]);
  }
  const outputRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const forceBottomRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onStatusRef = useRef(onStatus);
  const onStatsRef = useRef(onStats);
  onStatusRef.current = onStatus;
  onStatsRef.current = onStats;

  useEffect(() => {
    stickToBottomRef.current = true;
    forceBottomRef.current = true;
    setLines([]);
    setConnected(false);
    setReconnecting(false);

    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      clearReconnect();
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${window.location.host}/ws/servers/${serverId}/console`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attempt = 0;
        setConnected(true);
        setReconnecting(false);
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        wsRef.current = null;
        setReconnecting(true);
        const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.min(attempt, 4));
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ConsoleMessage;
        if (msg.type === "history") {
          forceBottomRef.current = true;
          stickToBottomRef.current = true;
          setLines(msg.lines.filter((line) => !isPlayersListLine(line)));
        } else if (msg.type === "output") {
          if (isPlayersListLine(msg.line)) return;
          setLines((prev) => [...prev.slice(-499), msg.line]);
        } else if (msg.type === "status") {
          onStatusRef.current?.(msg.status);
        } else if (msg.type === "stats") {
          onStatsRef.current?.(msg.stats);
        } else if (msg.type === "error") {
          setLines((prev) => [...prev, `[error] ${msg.message}`]);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      wsRef.current = null;
    };
  }, [serverId]);

  // Scroll after lines/history paint — mount-only effect missed the WS history dump.
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    if (!(forceBottomRef.current || stickToBottomRef.current)) return;

    const snap = () => {
      el.scrollTop = el.scrollHeight;
      forceBottomRef.current = false;
      stickToBottomRef.current = true;
    };
    snap();
    // Second frame: layout can lag after a large history batch.
    const raf = requestAnimationFrame(snap);
    return () => cancelAnimationFrame(raf);
  }, [lines, panelNotices]);

  function onOutputScroll(e: UIEvent<HTMLDivElement>) {
    stickToBottomRef.current = isNearBottom(e.currentTarget);
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ type: "command", command: trimmed }));
    setCommand("");
    stickToBottomRef.current = true;
    forceBottomRef.current = true;
  }

  return (
    <div className="console-panel">
      <div
        ref={outputRef}
        className="console-output font-monospace small"
        onScroll={onOutputScroll}
      >
        {!connected && !reconnecting && <div className="text-warning">Connecting…</div>}
        {!connected && reconnecting && <div className="text-warning">Reconnecting…</div>}
        {connected && lines.length === 0 && panelNotices.length === 0 && (
          <div className="text-secondary">No console output yet.</div>
        )}
        {lines.map((line, i) => {
          const tone = daemonConsoleTone(line);
          const className =
            tone === "ok"
              ? "console-line-daemon-ok"
              : tone === "progress"
                ? "console-line-daemon-progress"
                : tone === "notice"
                  ? "console-line-daemon-notice"
                  : tone === "error"
                    ? "console-line-error"
                    : tone === "info"
                      ? "console-line-daemon"
                      : undefined;
          return (
            <div key={`${i}-${line.slice(0, 24)}`} className={className}>
              {line}
            </div>
          );
        })}
        {panelNotices.map((notice, i) => (
          <div key={`panel-notice-${i}`} className="console-line-error">
            [Guartrix] {notice}
          </div>
        ))}
      </div>
      {canSend && favorites.length > 0 && (
        <Stack direction="horizontal" gap={1} className="flex-wrap px-2 pt-2 console-favorites">
          {favorites.map((fav) => (
            <Button
              key={fav}
              size="sm"
              variant="outline-secondary"
              className="font-monospace"
              disabled={!connected}
              onClick={() => setCommand(fav)}
              onContextMenu={(e) => {
                e.preventDefault();
                void persistFavorites(favorites.filter((f) => f !== fav));
              }}
              title="Click to use · right-click to remove"
            >
              /{fav}
            </Button>
          ))}
        </Stack>
      )}
      {canSend && (
        <Form onSubmit={send} className="console-input-bar">
          <InputGroup>
            <InputGroup.Text className="font-monospace">&gt;</InputGroup.Text>
            <Form.Control
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("console.placeholder")}
              disabled={!connected}
              autoComplete="off"
              spellCheck={false}
              className="font-monospace"
            />
            <Button
              type="button"
              variant="outline-secondary"
              disabled={!command.trim()}
              title="Save as favorite"
              onClick={() => addFavorite()}
            >
              <i className="fa-solid fa-star" />
            </Button>
            <Button type="submit" variant="primary" disabled={!connected}>
              {t("console.send")}
            </Button>
          </InputGroup>
        </Form>
      )}
    </div>
  );
}
