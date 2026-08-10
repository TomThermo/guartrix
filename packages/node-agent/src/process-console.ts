/**
 * Console history load/persist/append, daemonSay, and player-line parsing.
 * Extracted from process-manager.ts so that file can stay focused on
 * start/stop orchestration and status maps.
 *
 * Functions operate on a `ConsoleHost` — the slice of ProcessManager state
 * they need — rather than a concrete class.
 */
import fs from "node:fs";
import path from "node:path";
import { dockerImageForServerType, runtimeKindFor } from "@guartrix/shared";
import { serverDir } from "./config.js";
import { docker } from "./docker.js";
import { recordPlayerJoin, recordPlayerLeave, syncOnlineSet } from "./player-history.js";
import { computeDiskUsageMessage } from "./process-start.js";
import type { DaemonServerConfig, ManagedProcess } from "./process-types.js";

export const MAX_HISTORY = 500;
export const CONSOLE_HISTORY_FILE = "guartrix-console-history.json";

export interface ConsoleHost {
  histories: Map<string, string[]>;
  persistTimers: Map<string, ReturnType<typeof setTimeout>>;
  processes: Map<string, ManagedProcess>;
  lastConfigs: Map<string, DaemonServerConfig>;
  emit(event: string, ...args: unknown[]): boolean;
  getOnlinePlayerNames(serverId: string): string[];
}

export function consoleHistoryPath(serverId: string): string {
  return path.join(serverDir(serverId), CONSOLE_HISTORY_FILE);
}

/** Panel polls `/list` for online players — hide that spam from the console. */
export function isPlayersListLine(line: string): boolean {
  return /There are \d+ of a max of \d+ players online:/i.test(line);
}

export function loadPersistedConsoleHistory(serverId: string): string[] {
  try {
    const raw = fs.readFileSync(consoleHistoryPath(serverId), "utf8");
    const data = JSON.parse(raw) as { lines?: unknown };
    if (!Array.isArray(data.lines)) return [];
    return data.lines
      .filter((line): line is string => typeof line === "string")
      .filter((line) => !isPlayersListLine(line))
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

/** Fallback when no Guartrix history yet: last lines from Minecraft latest.log */
export function loadLatestLogTail(serverId: string): string[] {
  const logPath = path.join(serverDir(serverId), "logs", "latest.log");
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .filter((l) => l !== "")
      .filter((l) => !isPlayersListLine(l));
    return lines.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

export function formatDaemonStamp(at = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(at.getDate())}-${pad(at.getMonth() + 1)}-${at.getFullYear()} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** Minecraft-style clock for console lines (`[05:30:33]`). */
export function formatDaemonClock(at = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

export function getConsoleHistory(host: ConsoleHost, serverId: string): string[] {
  let lines = host.histories.get(serverId);
  if (!lines) {
    lines = loadPersistedConsoleHistory(serverId);
    if (lines.length === 0) {
      lines = loadLatestLogTail(serverId);
    }
    host.histories.set(serverId, lines);
  } else if (lines.some(isPlayersListLine)) {
    lines = lines.filter((l) => !isPlayersListLine(l));
    host.histories.set(serverId, lines);
    schedulePersistHistory(host, serverId);
  }
  // multi-node resume banner when opening the console (not persisted)
  return [
    `[${formatDaemonClock()}] [Guartrix Daemon] Resuming log starting from: ${formatDaemonStamp()}`,
    ...lines,
  ];
}

export function schedulePersistHistory(host: ConsoleHost, serverId: string): void {
  const existing = host.persistTimers.get(serverId);
  if (existing) clearTimeout(existing);
  host.persistTimers.set(
    serverId,
    setTimeout(() => {
      host.persistTimers.delete(serverId);
      persistConsoleHistory(host, serverId);
    }, 750),
  );
}

export function persistConsoleHistory(host: ConsoleHost, serverId: string): void {
  const lines = host.histories.get(serverId);
  if (!lines) return;
  try {
    const dir = serverDir(serverId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      consoleHistoryPath(serverId),
      `${JSON.stringify({ lines: lines.slice(-MAX_HISTORY) })}\n`,
      "utf8",
    );
  } catch {
    // best-effort
  }
}

export function trackPlayerLine(host: ConsoleHost, serverId: string, line: string): void {
  const managed = host.processes.get(serverId);
  if (!managed) return;

  // Strip ANSI / log prefixes loosely and match join/leave
  const join =
    line.match(/\b([A-Za-z0-9_]{3,16}) joined the game\b/) ??
    line.match(/\b([A-Za-z0-9_]{3,16}) logged in with entity id\b/) ??
    line.match(/Player connected:\s*([A-Za-z0-9_]{3,16})/i);
  if (join?.[1]) {
    managed.onlinePlayers.add(join[1]);
    void recordPlayerJoin(serverId, join[1]);
    host.emit("players", serverId, host.getOnlinePlayerNames(serverId));
    return;
  }

  const leave =
    line.match(/\b([A-Za-z0-9_]{3,16}) left the game\b/) ??
    line.match(/\b([A-Za-z0-9_]{3,16}) lost connection:/) ??
    line.match(/\b([A-Za-z0-9_]{3,16}) was kicked\b/) ??
    line.match(/Player disconnected:\s*([A-Za-z0-9_]{3,16})/i);
  if (leave?.[1]) {
    managed.onlinePlayers.delete(leave[1]);
    void recordPlayerLeave(serverId, leave[1]);
    host.emit("players", serverId, host.getOnlinePlayerNames(serverId));
    return;
  }

  // /list output: "There are 2 of a max of 20 players online: Steve, Alex"
  const listMatch = line.match(/There are \d+ of a max of \d+ players online:\s*(.*)$/i);
  if (listMatch) {
    managed.onlinePlayers.clear();
    const names = (listMatch[1] ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter((n) => /^[A-Za-z0-9_]{3,16}$/.test(n));
    for (const name of names) managed.onlinePlayers.add(name);
    void syncOnlineSet(serverId, names);
    host.emit("players", serverId, host.getOnlinePlayerNames(serverId));
  }
}

export function appendConsoleHistory(host: ConsoleHost, serverId: string, line: string): void {
  trackPlayerLine(host, serverId, line);
  // Still parse /list for online tracking, but do not clutter the console UI.
  if (isPlayersListLine(line)) return;

  let history = host.histories.get(serverId);
  if (!history) {
    history = loadPersistedConsoleHistory(serverId);
    host.histories.set(serverId, history);
  }
  history.push(line);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  schedulePersistHistory(host, serverId);
}

export function pushConsoleLine(
  host: ConsoleHost,
  serverId: string,
  line: string,
  stream: "stdout" | "stderr" = "stdout",
): void {
  appendConsoleHistory(host, serverId, line);
  if (isPlayersListLine(line)) return;
  host.emit("output", serverId, line, stream);
}

export function daemonSay(host: ConsoleHost, serverId: string, message: string): void {
  if (!host.histories.has(serverId)) {
    host.histories.set(serverId, loadPersistedConsoleHistory(serverId));
  }
  pushConsoleLine(host, serverId, `[${formatDaemonClock()}] [Guartrix Daemon] ${message}`);
}

export async function emitDiskUsage(host: ConsoleHost, serverId: string): Promise<void> {
  daemonSay(host, serverId, "Checking size of server data directory...");
  const message = await computeDiskUsageMessage(serverId, serverDir(serverId));
  daemonSay(host, serverId, message);
}

export async function emitStartupBanner(
  host: ConsoleHost,
  serverId: string,
  javaCmd: string[],
): Promise<void> {
  if (!host.histories.has(serverId)) {
    host.histories.set(serverId, loadPersistedConsoleHistory(serverId));
  }
  daemonSay(host, serverId, `Resuming log starting from: ${formatDaemonStamp()}`);
  const serverType = host.lastConfigs.get(serverId)?.type;
  if (runtimeKindFor(serverType ?? "VANILLA") === "java") {
    try {
      const image = dockerImageForServerType(
        serverType ?? "VANILLA",
        host.lastConfigs.get(serverId)?.javaVersion,
      );
      const { stdout, stderr } = await docker(["run", "--rm", image, "java", "-version"], {
        timeout: 20_000,
      });
      const text = `${stderr || ""}${stdout || ""}`;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) pushConsoleLine(host, serverId, line.trim());
      }
    } catch {
      // java -version is best-effort
    }
  }
  pushConsoleLine(host, serverId, `container@guartrix~ ${javaCmd.join(" ")}`);
}
