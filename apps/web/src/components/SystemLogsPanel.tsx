import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import type { ConsoleMessage, StatusNode } from "@msm/shared";
import { Badge, Button } from "react-bootstrap";
import { Console } from "./Console";

export type SystemLogSource =
  | "daemon"
  | "api"
  | "web"
  | "monitor"
  | "mysql"
  | `mc:${string}`;

const SYSTEM_TABS: Array<{ id: Exclude<SystemLogSource, `mc:${string}`>; label: string; icon: string }> =
  [
    { id: "daemon", label: "Daemon", icon: "fa-microchip" },
    { id: "api", label: "API-server", icon: "fa-server" },
    { id: "web", label: "Webserver", icon: "fa-globe" },
    { id: "monitor", label: "Watchdog", icon: "fa-heart-pulse" },
    { id: "mysql", label: "MySQL", icon: "fa-database" },
  ];

const BOTTOM_THRESHOLD_PX = 48;

function isNearBottom(el: HTMLElement, threshold = BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function LiveFileConsole({ source }: { source: Exclude<SystemLogSource, `mc:${string}`> }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const forceBottomRef = useRef(false);

  useEffect(() => {
    stickToBottomRef.current = true;
    forceBottomRef.current = true;
    setLines([]);
    setConnected(false);

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/ws/admin/logs/${source}?tail=400`,
    );

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ConsoleMessage;
      if (msg.type === "history") {
        forceBottomRef.current = true;
        stickToBottomRef.current = true;
        setLines(msg.lines);
      } else if (msg.type === "output") {
        setLines((prev) => [...prev.slice(-799), msg.line]);
      } else if (msg.type === "error") {
        setLines((prev) => [...prev, `[error] ${msg.message}`]);
      }
    };

    return () => {
      ws.close();
    };
  }, [source]);

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    if (forceBottomRef.current || stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      forceBottomRef.current = false;
      stickToBottomRef.current = true;
    }
  }, [lines]);

  function onOutputScroll(e: UIEvent<HTMLDivElement>) {
    stickToBottomRef.current = isNearBottom(e.currentTarget);
  }

  return (
    <div className="console-panel status-log-console">
      <div
        ref={outputRef}
        className="console-output font-monospace small"
        onScroll={onOutputScroll}
      >
        {!connected && <div className="text-warning">Connecting…</div>}
        {connected && lines.length === 0 && (
          <div className="text-secondary">No log lines yet.</div>
        )}
        {lines.map((line, i) => (
          <div key={`${i}-${line.slice(0, 32)}`}>{line}</div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  nodes: StatusNode[];
}

export function SystemLogsPanel({ nodes }: Props) {
  const mcServers = useMemo(() => {
    const out: Array<{ id: string; name: string; nodeName: string }> = [];
    for (const node of nodes) {
      for (const c of node.containers) {
        if (c.isMysql || !c.serverId) continue;
        out.push({
          id: c.serverId,
          name: c.serverName ?? c.serverId,
          nodeName: node.name,
        });
      }
    }
    return out;
  }, [nodes]);

  const [source, setSource] = useState<SystemLogSource>("daemon");

  useEffect(() => {
    if (source.startsWith("mc:")) {
      const id = source.slice(3);
      if (!mcServers.some((s) => s.id === id)) {
        setSource("daemon");
      }
    }
  }, [mcServers, source]);

  return (
    <div className="status-logs mt-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div>
          <h2 className="h5 mb-0">Live logs</h2>
          <p className="text-secondary small mb-0">
            Live logs: web server, API server, daemon, watchdog, MySQL, and Minecraft consoles.
          </p>
        </div>
        <Badge bg={source.startsWith("mc:") ? "success" : "secondary"}>
          {source.startsWith("mc:") ? "Minecraft console" : "System log"}
        </Badge>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-2">
        {SYSTEM_TABS.map((tab) => (
          <Button
            key={tab.id}
            size="sm"
            variant={source === tab.id ? "primary" : "outline-secondary"}
            onClick={() => setSource(tab.id)}
          >
            <i className={`fa-solid ${tab.icon} me-1`} />
            {tab.label}
          </Button>
        ))}
        {mcServers.map((s) => {
          const id = `mc:${s.id}` as const;
          return (
            <Button
              key={s.id}
              size="sm"
              variant={source === id ? "primary" : "outline-secondary"}
              onClick={() => setSource(id)}
              title={`Node: ${s.nodeName}`}
            >
              <i className="fa-solid fa-cube me-1" />
              {s.name}
            </Button>
          );
        })}
      </div>

      {source.startsWith("mc:") ? (
        <Console serverId={source.slice(3)} canSend={false} />
      ) : (
        <LiveFileConsole
          source={source as Exclude<SystemLogSource, `mc:${string}`>}
        />
      )}
    </div>
  );
}
