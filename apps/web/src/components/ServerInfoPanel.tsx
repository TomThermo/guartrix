import { useEffect, useRef, useState } from "react";
import type {
  ConnectInfo,
  DiskUsageBreakdown,
  McServer,
  ServerStats,
  SystemInfo,
} from "@msm/shared";
import { Spinner } from "react-bootstrap";
import { api } from "../api";
import { useSharedOnlinePlayers } from "../hooks/OnlinePlayersProvider";
import { useI18n } from "../i18n/react";
import { copyText } from "../utils";
import { JoinCard } from "./JoinCard";

interface Props {
  server: McServer;
  connect: ConnectInfo | null;
  system: SystemInfo | null;
  /** When set (console WS), skip aggressive HTTP stats polling. */
  liveStats?: ServerStats | null;
}

function InfoRow({
  label,
  value,
  mono,
  onCopy,
  copyTitle,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copyTitle: string;
}) {
  return (
    <div className="server-info-row">
      <div className="server-info-label">{label}</div>
      <div className={`server-info-value ${mono ? "font-monospace" : ""}`}>
        <span className="text-break">{value}</span>
        {onCopy && (
          <button
            type="button"
            className="server-info-copy"
            title={copyTitle}
            onClick={() => void onCopy()}
          >
            <i className="fa-solid fa-copy" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ServerInfoPanel({
  server,
  connect,
  system: _system,
  liveStats,
}: Props) {
  const { t } = useI18n();
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [disk, setDisk] = useState<DiskUsageBreakdown | null>(null);
  const sharedOnline = useSharedOnlinePlayers();
  const online = sharedOnline?.data ?? null;
  const [copied, setCopied] = useState<string | null>(null);
  const liveStatsRef = useRef(liveStats);
  liveStatsRef.current = liveStats;

  useEffect(() => {
    if (liveStats) {
      setStats(liveStats);
      if (liveStats.disk) setDisk(liveStats.disk);
    }
  }, [liveStats]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const live = liveStatsRef.current;
        const [nextStats, nextDisk] = await Promise.all([
          live ? Promise.resolve(null) : api.getStats(server.id).catch(() => null),
          live?.disk
            ? Promise.resolve(null)
            : api.getDiskUsage(server.id).catch(() => null),
        ]);
        if (cancelled) return;
        if (nextStats) setStats(nextStats);
        if (nextDisk) setDisk(nextDisk);
      } catch {
        // ignore
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [server.id]);

  async function copy(label: string, text: string) {
    try {
      await copyText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  const ramUsedMb = stats?.running
    ? Math.round(stats.memoryUsedBytes / (1024 * 1024))
    : 0;
  const ramLabel = `${ramUsedMb} / ${server.memoryMb} MB`;
  const cpuPercent = stats?.running ? Math.min(100, stats.cpuPercent) : 0;

  const diskUsed = disk?.totalLabel ?? "—";
  const playersOnline = online?.playersOnline ?? 0;
  const playersMax =
    online && online.playersMax > 0
      ? online.playersMax
      : Number(connect?.maxPlayers ?? 20) || 20;
  const playersLabel =
    server.status === "RUNNING" || server.status === "STARTING"
      ? `${playersOnline} / ${playersMax}`
      : `— / ${playersMax}`;

  const versionParts = [server.mcVersion];
  if (server.paperBuild) versionParts.push(`build ${server.paperBuild}`);
  if (server.fabricLoaderVersion)
    versionParts.push(`loader ${server.fabricLoaderVersion}`);
  if (server.forgeVersion) versionParts.push(server.forgeVersion);

  return (
    <aside className="server-info-panel">
      <div className="server-info-title">
        <i className="fa-solid fa-circle-info me-2" />
        {t("serverInfo.title")}
        {copied && <span className="server-info-copied">{t("serverInfo.copied")}</span>}
      </div>
      <JoinCard
        server={server}
        connect={connect}
        onNotice={(msg) => {
          if (msg) {
            setCopied("ok");
            setTimeout(() => setCopied(null), 1500);
          }
        }}
      />
      <InfoRow
        label={t("serverInfo.timeLeft")}
        value={t("common.unlimited")}
        copyTitle={t("common.copy")}
      />
      <InfoRow
        label={t("serverInfo.serverId")}
        value={server.id}
        mono
        copyTitle={t("common.copy")}
        onCopy={() => void copy(t("serverInfo.serverId"), server.id)}
      />
      <InfoRow label={t("resources.ram")} value={ramLabel} copyTitle={t("common.copy")} />
      <InfoRow label={t("resources.cpu")} value={`${cpuPercent.toFixed(1)}%`} copyTitle={t("common.copy")} />
      <InfoRow label={t("serverInfo.storage")} value={diskUsed} copyTitle={t("common.copy")} />
      <InfoRow label={t("serverInfo.players")} value={playersLabel} copyTitle={t("common.copy")} />
      <InfoRow
        label={t("common.version")}
        value={versionParts.filter(Boolean).join(" · ") || "—"}
        copyTitle={t("common.copy")}
      />
      <InfoRow label={t("common.node")} value={server.nodeName ?? "—"} copyTitle={t("common.copy")} />
      {!stats && !disk && (
        <div className="text-center py-2">
          <Spinner size="sm" animation="border" className="text-secondary" />
        </div>
      )}
    </aside>
  );
}
