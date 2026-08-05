import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { ServerStatus } from "@msm/shared";
import {
  assertSafeStartupCommandForType,
  BEDROCK_BINARY,
  consoleLineIndicatesBootFailure,
  consoleLineIndicatesReady,
  containerEnvForRuntime,
  defaultServerExecutable,
  dockerImageForServerType,
  normalizeServerExecutable,
  POCKETMINE_PHAR,
  runtimeKindFor,
  runtimeLabelForServerType,
} from "@msm/shared";
import { config, serverDir } from "./config.js";
import {
  containerName,
  docker,
  ensureDockerReady,
  ensureJavaImage,
  isContainerRunning,
  listGuartrixContainers,
  removeContainer,
  resolveContainerName,
} from "./docker.js";
import {
  connectContainerToSharedNetwork,
  ensureGuartrixNetwork,
  GUARTRIX_NETWORK,
  resolveGameNetwork,
} from "./mysql.js";
import { invalidateDiskUsage } from "./disk-usage.js";
import { resourceMonitor } from "./resource-monitor.js";
import {
  writeServerLimits,
  isOverDiskQuota,
  cpuLimitToDockerCpus,
} from "./disk-quota.js";
import {
  recordPlayerJoin,
  recordPlayerLeave,
  syncOnlineSet,
} from "./player-history.js";
import { ensureDefaultServerIcon } from "./default-icon.js";
import { ensureBdsBootProperties, bedrockContainerDnsServers, ensureBedrockRuntimeImage, bedrockRuntimeImageExists } from "./bedrock-boot.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  stopProcess,
  killProcess,
  sendProcessCommand,
  stopAllProcesses,
} from "./process-lifecycle.js";
import {
  buildDockerRunArgs,
  checkPortFree,
  computeDiskUsageMessage,
  fixDataOwnership,
  resolveRuntimeCommand,
  writeForgeJvmArgsFile,
} from "./process-start.js";
import type {
  DaemonPortPublish,
  DaemonServerConfig,
  ManagedProcess,
} from "./process-types.js";

export type { DaemonPortPublish, DaemonServerConfig } from "./process-types.js";
export { fixDataOwnership } from "./process-start.js";

function formatPublishPorts(ports: DaemonPortPublish[]): string {
  return ports.map((p) => `${p.port}/${p.protocol}`).join(", ");
}

function publishPortsEqual(
  a: DaemonPortPublish[],
  b: DaemonPortPublish[],
): boolean {
  if (a.length !== b.length) return false;
  const key = (p: DaemonPortPublish) => `${p.port}/${p.protocol}`;
  const setA = new Set(a.map(key));
  return b.every((p) => setA.has(key(p)));
}

function resolvePublishPorts(server: DaemonServerConfig): DaemonPortPublish[] {
  return server.ports && server.ports.length > 0
    ? server.ports
    : [{ port: server.port, protocol: "tcp" }];
}

const execFileAsync = promisify(execFile);

const MAX_HISTORY = 500;
const CONSOLE_HISTORY_FILE = "guartrix-console-history.json";

/**
 * Kill leftover `docker run` / `docker attach` client processes for a
 * container without stopping the container itself. After a daemon restart the
 * previous client's process can stay alive (reparented to init) and keep
 * holding stdin — which blocks the new daemon from sending console commands.
 *
 * Uses SIGKILL so Docker's default sig-proxy cannot forward SIGTERM into the
 * Minecraft process.
 */
async function killOrphanDockerClients(container: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,args="], {
      timeout: 5_000,
    });
    const pids: number[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const space = trimmed.indexOf(" ");
      if (space <= 0) continue;
      const pid = Number(trimmed.slice(0, space));
      const args = trimmed.slice(space + 1);
      if (!Number.isFinite(pid) || pid === process.pid) continue;
      if (
        !args.includes(`--name ${container}`) &&
        !args.includes(`--name=${container}`) &&
        !args.endsWith(` ${container}`) &&
        !args.includes(` ${container} `)
      ) {
        // Also match bare attach/run with container as last arg
        if (!args.includes(container)) continue;
      }
      if (!/\bdocker\b/.test(args)) continue;
      if (!/\b(run|attach)\b/.test(args)) continue;
      pids.push(pid);
    }
    for (const pid of pids) {
      try {
        await execFileAsync("sudo", ["-n", "kill", "-9", String(pid)], {
          timeout: 5_000,
        });
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
    if (pids.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  } catch {
    // best-effort
  }
}

function consoleHistoryPath(serverId: string): string {
  return path.join(serverDir(serverId), CONSOLE_HISTORY_FILE);
}

/** Panel polls `/list` for online players — hide that spam from the console. */
function isPlayersListLine(line: string): boolean {
  return /There are \d+ of a max of \d+ players online:/i.test(line);
}

function loadPersistedConsoleHistory(serverId: string): string[] {
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
function loadLatestLogTail(serverId: string): string[] {
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

class ProcessManager extends EventEmitter {
  // Note: `processes` / `intentionalStops` / `restartAttempts` and the
  // daemonSay/setStatus/persistHistory methods below are intentionally not
  // `private` — process-lifecycle.ts (stop/kill/sendCommand) needs to read
  // and mutate them via the LifecycleHost interface. This class remains the
  // only place that constructs/owns that state; nothing outside this package
  // touches them.
  processes = new Map<string, ManagedProcess>();
  /** Survives stop/exit so the console still shows output when the server is offline. */
  private histories = new Map<string, string[]>();
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Last start config per server — used for auto-restart without a DB. */
  private lastConfigs = new Map<string, DaemonServerConfig>();
  restartAttempts = new Map<string, { count: number; at: number }>();
  private statuses = new Map<string, ServerStatus>();
  /** Panel-issued stop/kill — never treat the following exit as a crash. */
  intentionalStops = new Set<string>();

  isRunning(serverId: string): boolean {
    return this.processes.has(serverId);
  }

  getStatus(serverId: string): ServerStatus {
    return this.statuses.get(serverId) ?? "STOPPED";
  }

  getLastConfig(serverId: string): DaemonServerConfig | undefined {
    return this.lastConfigs.get(serverId);
  }

  getHistory(serverId: string): string[] {
    let lines = this.histories.get(serverId);
    if (!lines) {
      lines = loadPersistedConsoleHistory(serverId);
      if (lines.length === 0) {
        lines = loadLatestLogTail(serverId);
      }
      this.histories.set(serverId, lines);
    } else if (lines.some(isPlayersListLine)) {
      lines = lines.filter((l) => !isPlayersListLine(l));
      this.histories.set(serverId, lines);
      this.schedulePersistHistory(serverId);
    }
    // multi-node resume banner when opening the console (not persisted)
    return [
      `[${this.formatDaemonClock()}] [Guartrix Daemon] Resuming log starting from: ${this.formatDaemonStamp()}`,
      ...lines,
    ];
  }

  private schedulePersistHistory(serverId: string): void {
    const existing = this.persistTimers.get(serverId);
    if (existing) clearTimeout(existing);
    this.persistTimers.set(
      serverId,
      setTimeout(() => {
        this.persistTimers.delete(serverId);
        this.persistHistory(serverId);
      }, 750),
    );
  }

  persistHistory(serverId: string): void {
    const lines = this.histories.get(serverId);
    if (!lines) return;
    try {
      const dir = serverDir(serverId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        consoleHistoryPath(serverId),
        JSON.stringify({ lines: lines.slice(-MAX_HISTORY) }) + "\n",
        "utf8",
      );
    } catch {
      // best-effort
    }
  }

  getContainerName(serverId: string): string | null {
    return this.processes.get(serverId)?.container ?? null;
  }

  getOnlinePlayerNames(serverId: string): string[] {
    const managed = this.processes.get(serverId);
    if (!managed) return [];
    return [...managed.onlinePlayers].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }

  private trackPlayerLine(serverId: string, line: string): void {
    const managed = this.processes.get(serverId);
    if (!managed) return;

    // Strip ANSI / log prefixes loosely and match join/leave
    const join =
      line.match(/\b([A-Za-z0-9_]{3,16}) joined the game\b/) ??
      line.match(/\b([A-Za-z0-9_]{3,16}) logged in with entity id\b/) ??
      line.match(/Player connected:\s*([A-Za-z0-9_]{3,16})/i);
    if (join?.[1]) {
      managed.onlinePlayers.add(join[1]);
      void recordPlayerJoin(serverId, join[1]);
      this.emit("players", serverId, this.getOnlinePlayerNames(serverId));
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
      this.emit("players", serverId, this.getOnlinePlayerNames(serverId));
      return;
    }

    // /list output: "There are 2 of a max of 20 players online: Steve, Alex"
    const listMatch = line.match(
      /There are \d+ of a max of \d+ players online:\s*(.*)$/i,
    );
    if (listMatch) {
      managed.onlinePlayers.clear();
      const names = (listMatch[1] ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter((n) => /^[A-Za-z0-9_]{3,16}$/.test(n));
      for (const name of names) managed.onlinePlayers.add(name);
      void syncOnlineSet(serverId, names);
      this.emit("players", serverId, this.getOnlinePlayerNames(serverId));
    }
  }

  private appendHistory(serverId: string, line: string): void {
    this.trackPlayerLine(serverId, line);
    // Still parse /list for online tracking, but do not clutter the console UI.
    if (isPlayersListLine(line)) return;

    let history = this.histories.get(serverId);
    if (!history) {
      history = loadPersistedConsoleHistory(serverId);
      this.histories.set(serverId, history);
    }
    history.push(line);
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
    this.schedulePersistHistory(serverId);
  }

  setStatus(
    serverId: string,
    status: ServerStatus,
    errorMessage?: string | null,
  ): void {
    this.statuses.set(serverId, status);
    this.emit("status", serverId, status, errorMessage ?? null);

    // Wings-style: stream Docker Engine stats while the container is running.
    // Keep polling through STOPPING so the UI shows usage until exit.
    if (status === "RUNNING") {
      resourceMonitor.enable(serverId);
    } else if (status === "STOPPED" || status === "ERROR") {
      resourceMonitor.disable(serverId);
      invalidateDiskUsage(serverId);
    }
  }

  async isPortFree(
    port: number,
    protocol: "tcp" | "udp" = "tcp",
  ): Promise<boolean> {
    return checkPortFree(port, protocol);
  }

  private formatDaemonStamp(at = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(at.getDate())}-${pad(at.getMonth() + 1)}-${at.getFullYear()} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  }

  /** Minecraft-style clock for console lines (`[05:30:33]`). */
  private formatDaemonClock(at = new Date()): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  }

  private pushConsoleLine(
    serverId: string,
    line: string,
    stream: "stdout" | "stderr" = "stdout",
  ): void {
    this.appendHistory(serverId, line);
    if (isPlayersListLine(line)) return;
    this.emit("output", serverId, line, stream);
  }

  daemonSay(serverId: string, message: string): void {
    if (!this.histories.has(serverId)) {
      this.histories.set(serverId, loadPersistedConsoleHistory(serverId));
    }
    this.pushConsoleLine(
      serverId,
      `[${this.formatDaemonClock()}] [Guartrix Daemon] ${message}`,
    );
  }

  private async emitDiskUsage(serverId: string): Promise<void> {
    this.daemonSay(serverId, "Checking size of server data directory...");
    const message = await computeDiskUsageMessage(serverId, serverDir(serverId));
    this.daemonSay(serverId, message);
  }

  private async emitStartupBanner(
    serverId: string,
    javaCmd: string[],
  ): Promise<void> {
    if (!this.histories.has(serverId)) {
      this.histories.set(serverId, loadPersistedConsoleHistory(serverId));
    }
    this.daemonSay(
      serverId,
      `Resuming log starting from: ${this.formatDaemonStamp()}`,
    );
    const serverType = this.lastConfigs.get(serverId)?.type;
    if (runtimeKindFor(serverType ?? "VANILLA") === "java") {
      try {
        const image = dockerImageForServerType(
          serverType ?? "VANILLA",
          this.lastConfigs.get(serverId)?.javaVersion,
        );
        const { stdout, stderr } = await docker(
          ["run", "--rm", image, "java", "-version"],
          { timeout: 20_000 },
        );
        const text = `${stderr || ""}${stdout || ""}`;
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) this.pushConsoleLine(serverId, line.trim());
        }
      } catch {
        // java -version is best-effort
      }
    }
    this.pushConsoleLine(
      serverId,
      `container@guartrix~ ${javaCmd.join(" ")}`,
    );
  }

  private wireManagedChild(
    serverId: string,
    name: string,
    child: ChildProcessWithoutNullStreams,
    opts?: { waitForDone?: boolean },
  ): ManagedProcess {
    if (!this.histories.has(serverId)) {
      this.histories.set(serverId, loadPersistedConsoleHistory(serverId));
    }

    const managed: ManagedProcess = {
      process: child,
      container: name,
      onlinePlayers: new Set(),
    };
    this.processes.set(serverId, managed);

    const waitForDone = opts?.waitForDone === true;
    let sawDone = !waitForDone;
    const serverType = this.lastConfigs.get(serverId)?.type;

    const handleChunk = (stream: "stdout" | "stderr") => (data: Buffer) => {
      const text = data.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line === "") continue;
        this.appendHistory(serverId, line);
        if (!sawDone && consoleLineIndicatesReady(line, serverType)) {
          sawDone = true;
          this.daemonSay(serverId, "Server marked as RUNNING");
          this.setStatus(serverId, "RUNNING");
        }
        if (consoleLineIndicatesBootFailure(line, serverType)) {
          const msg = line.trim();
          this.daemonSay(serverId, `ERROR: ${msg}`);
          this.setStatus(serverId, "ERROR", msg);
        }
        if (isPlayersListLine(line)) continue;
        this.emit("output", serverId, line, stream);
      }
    };

    child.stdout.on("data", handleChunk("stdout"));
    child.stderr.on("data", handleChunk("stderr"));

    child.on("exit", () => {
      const current = this.processes.get(serverId);
      if (!current || current.process !== child) return;
      this.processes.delete(serverId);
      this.persistHistory(serverId);

      // Attach can drop while the container keeps running (daemon restart,
      // orphan takeover, etc.). Don't mark the server STOPPED in that case.
      void isContainerRunning(serverId)
        .then((still) => {
          if (still) {
            this.daemonSay(
              serverId,
              "Console attachment lost — container still running.",
            );
            this.setStatus(serverId, "RUNNING");
            return;
          }
          const code = child.exitCode;
          const signal = child.signalCode;
          // 137 = 128+SIGKILL — typical Docker OOM kill; do not treat as clean stop.
          const oom = code === 137 || code === 137 - 256;
          // SIGTERM/SIGINT via docker stop often surface as exit 143/130 with no signalCode.
          const intentional =
            this.intentionalStops.has(serverId) ||
            this.getStatus(serverId) === "STOPPING";
          const clean =
            intentional ||
            (!oom &&
              (code === 0 ||
                code === 130 ||
                code === 143 ||
                signal === "SIGTERM" ||
                signal === "SIGINT"));
          if (intentional) {
            this.intentionalStops.delete(serverId);
            this.restartAttempts.delete(serverId);
          }
          if (clean) {
            // Intentional stop()/kill() already announces OFF after wait.
            // Do not key off status===STOPPING — stopProcess may already have
            // set STOPPED by the time this async container check finishes.
            if (!intentional) {
              this.daemonSay(serverId, "Server marked as OFF");
            }
            this.setStatus(serverId, "STOPPED", null);
            return;
          }
          const message = oom
            ? `Out of memory (exit 137): heap + JVM overhead exceeded the container limit, or the host ran out of RAM. Remove -XX:+AlwaysPreTouch, lower -Xmx, or free host memory.`
            : `Container exited with code ${code ?? "null"} signal ${signal ?? "null"}`;
          this.daemonSay(serverId, `ERROR: ${message}`);
          this.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
          if (!intentional) {
            this.daemonSay(serverId, "Server marked as OFF");
          }
          this.setStatus(serverId, "ERROR", message);
          void this.maybeAutoRestart(serverId, message);
        })
        .catch(() => {
          if (!this.intentionalStops.has(serverId) && this.getStatus(serverId) !== "STOPPING") {
            this.daemonSay(serverId, "Server marked as OFF");
          }
          this.setStatus(serverId, "STOPPED", null);
        });
    });

    return managed;
  }

  /**
   * Attach to an already-running container's stdin/stdout so console commands
   * and live logs work again after a daemon restart.
   */
  private async attachToContainer(
    serverId: string,
    name: string,
    opts?: { waitForDone?: boolean },
  ): Promise<void> {
    await killOrphanDockerClients(name);

    const child = spawn(
      "sudo",
      ["-n", "docker", "attach", "--sig-proxy=false", name],
      {
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (err) => {
        this.processes.delete(serverId);
        reject(err);
      });
    });

    this.wireManagedChild(serverId, name, child, opts);
    if (!opts?.waitForDone) {
      this.setStatus(serverId, "RUNNING");
    }
  }

  /**
   * If the Minecraft container is already running (e.g. after a panel/daemon
   * restart) but we have no stdin handle, reattach so commands work again.
   */
  async adoptRunning(serverId: string): Promise<boolean> {
    if (this.processes.has(serverId)) return true;
    const running = await isContainerRunning(serverId).catch(() => false);
    if (!running) return false;
    const name =
      (await resolveContainerName(serverId).catch(() => null)) ??
      containerName(serverId);
    this.daemonSay(
      serverId,
      "Reattaching to running container after daemon restart…",
    );
    await this.attachToContainer(serverId, name);
    this.daemonSay(serverId, "Console reattached.");
    return true;
  }

  /** On daemon boot: reclaim every live Guartrix Minecraft container. */
  async reattachOrphans(): Promise<number> {
    let adopted = 0;
    const containers = await listGuartrixContainers().catch(() => []);
    for (const c of containers) {
      if (!c.serverId || c.isMysql) continue;
      if (c.state.toLowerCase() !== "running") continue;
      if (this.processes.has(c.serverId)) continue;
      try {
        await this.adoptRunning(c.serverId);
        adopted += 1;
      } catch (err) {
        console.error(
          `[daemon] failed to reattach ${c.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return adopted;
  }

  async start(server: DaemonServerConfig): Promise<void> {
    const serverId = server.id;

    const failStart = (message: string): never => {
      this.daemonSay(serverId, `ERROR: ${message}`);
      this.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
      this.setStatus(serverId, "ERROR", message);
      throw new Error(message);
    };

    if (this.processes.has(serverId)) {
      failStart("Server is already running");
    }

    // Container survived a panel/daemon restart — just reclaim the console.
    if (await isContainerRunning(serverId).catch(() => false)) {
      this.lastConfigs.set(serverId, { ...server });
      await this.adoptRunning(serverId);
      return;
    }

    if (server.memoryMb < 512 || server.memoryMb > 65536) {
      failStart("Memory must be between 512 and 65536 MB");
    }

    try {
      assertSafeStartupCommandForType(
        server.type,
        server.startupCommand,
        server.memoryMb,
        server.serverJar ?? undefined,
      );
    } catch (err) {
      failStart(err instanceof Error ? err.message : String(err));
    }

    const prevConfig = this.lastConfigs.get(serverId);
    this.lastConfigs.set(serverId, { ...server });

    const dir = serverDir(serverId);
    let executableName = defaultServerExecutable(server.type);
    try {
      executableName = normalizeServerExecutable(server.serverJar, server.type);
    } catch (err) {
      failStart(err instanceof Error ? err.message : String(err));
    }
    const executablePath = path.join(dir, executableName);
    const runShPath = path.join(dir, "run.sh");
    const runtimeKind = runtimeKindFor(server.type);
    const isForgeRuntime =
      runtimeKind === "java" &&
      (server.type === "FORGE" || server.type === "NEOFORGE") &&
      fs.existsSync(runShPath);
    if (runtimeKind === "bedrock_native") {
      if (!fs.existsSync(executablePath)) {
        failStart(
          `${BEDROCK_BINARY} not found — recreate the server or reinstall BDS`,
        );
      }
    } else if (runtimeKind === "php") {
      if (!fs.existsSync(executablePath)) {
        failStart(
          `${POCKETMINE_PHAR} not found — recreate the server or reinstall PocketMine`,
        );
      }
    } else if (!isForgeRuntime && !fs.existsSync(executablePath)) {
      failStart(
        `${executableName} not found — upload the jar or fix Server Jar File`,
      );
    }
    if (isForgeRuntime && !fs.existsSync(runShPath)) {
      failStart("Forge run.sh not found — recreate the server");
    }

    const publishPorts: DaemonPortPublish[] = resolvePublishPorts(server);
    for (const p of publishPorts) {
      const portFree = await this.isPortFree(p.port, p.protocol);
      if (!portFree) {
        failStart(`Port ${p.port}/${p.protocol} is already in use`);
      }
    }
    const publishArgs = publishPorts.flatMap((p) => [
      "-p",
      `${p.port}:${p.port}/${p.protocol}`,
    ]);

    const prev = prevConfig;
    if (prev) {
      const prevPorts = resolvePublishPorts(prev);
      if (!publishPortsEqual(prevPorts, publishPorts)) {
        this.daemonSay(
          serverId,
          `NOTICE: Your server port was changed while the server was stopped. Host firewall rules were verified and Docker is being rebuilt with the new port binding(s) before startup.`,
        );
        this.daemonSay(
          serverId,
          `NOTICE: Port(s) now: ${formatPublishPorts(publishPorts)} (previously: ${formatPublishPorts(prevPorts)}).`,
        );
      }
    }
    for (const notice of server.startupNotices ?? []) {
      this.daemonSay(serverId, `NOTICE: ${notice}`);
    }

    const name = containerName(serverId);

    await writeServerLimits(serverId, {
      diskMb: server.diskMb ?? 10_240,
      cpuLimit: server.cpuLimit ?? 0,
    });

    if (await isOverDiskQuota(serverId)) {
      failStart(
        `Disk quota exceeded — free space or raise the disk limit before starting`,
      );
    }

    this.setStatus(serverId, "STARTING", null);
    this.daemonSay(serverId, "Server marked as STARTING");
    this.daemonSay(
      serverId,
      "Your server container needs to be rebuilt. This should only take a few seconds, but could take a few minutes. You do not need to do anything else while this occurs. Your server will automatically continue with startup once this process is completed.",
    );
    this.daemonSay(serverId, "Server marked as STOPPING");
    this.daemonSay(serverId, "Server marked as OFF");

    this.daemonSay(serverId, "Rebuilding server container...");
    await removeContainer(serverId);
    this.daemonSay(serverId, "New container built, rotating hamsters...");
    this.daemonSay(serverId, "Container is being initialized...");
    this.daemonSay(
      serverId,
      "Completed rebuild process for server. Server is now booting.",
    );
    this.daemonSay(serverId, "Server marked as STARTING");

    await this.emitDiskUsage(serverId);

    this.daemonSay(serverId, "Ensuring correct ownership of files.");
    await fixDataOwnership(dir);

    this.daemonSay(serverId, "Running server preflight.");
    await ensureDockerReady();
    if (runtimeKind === "bedrock_native") {
      const needsBuild = !(await bedrockRuntimeImageExists());
      if (needsBuild) {
        this.daemonSay(
          serverId,
          "Building Bedrock runtime image (first time only, ~1–2 minutes)…",
        );
        await ensureBedrockRuntimeImage();
        this.daemonSay(serverId, "Bedrock runtime image ready.");
      }
    } else {
      const image = dockerImageForServerType(server.type, server.javaVersion);
      await ensureJavaImage(image);
    }
    const image = dockerImageForServerType(server.type, server.javaVersion);
    await ensureDefaultServerIcon(serverId);

    // Docker memory limit must cover heap + metaspace + native + threads.
    // AlwaysPreTouch + Xms=Xmx needs even more; 512MB was too tight for large heaps.
    const containerMemoryMb = server.memoryMb + Math.max(1024, Math.ceil(server.memoryMb * 0.1));
    const cpus = cpuLimitToDockerCpus(server.cpuLimit ?? 0);
    const cpuArgs = cpus ? (["--cpus", cpus] as const) : [];
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const gid = typeof process.getgid === "function" ? process.getgid() : 1000;

    if (isForgeRuntime) {
      const { warnings } = await writeForgeJvmArgsFile(dir, server, executableName);
      for (const warning of warnings) this.daemonSay(serverId, warning);
    }

    const { cmd: runtimeCmd, warnings: runtimeWarnings } = resolveRuntimeCommand(
      server,
      executableName,
      runtimeKind,
      isForgeRuntime,
    );
    for (const warning of runtimeWarnings) this.daemonSay(serverId, warning);

    this.daemonSay(
      serverId,
      `Using ${runtimeLabelForServerType(server.type, server.javaVersion)} (${image}) · ${runtimeCmd.join(" ")}`,
    );

    if (runtimeKind === "bedrock_native") {
      const bootWarnings = await ensureBdsBootProperties(dir, server.port);
      for (const w of bootWarnings) this.daemonSay(serverId, w);
    }

    this.daemonSay(serverId, "Starting server container.");
    await this.emitStartupBanner(serverId, runtimeCmd);

    const { primary: gameNetwork, attachSharedDb } =
      runtimeKind === "bedrock_native"
        ? await (async () => {
            await ensureGuartrixNetwork();
            return { primary: GUARTRIX_NETWORK, attachSharedDb: false };
          })()
        : await resolveGameNetwork(serverId);

    const bedrockDns =
      runtimeKind === "bedrock_native"
        ? await bedrockContainerDnsServers()
        : [];

    // Detached run: the container outlives the daemon. Console I/O goes through
    // `docker attach --sig-proxy=false` so a panel restart never kills Minecraft.
    const logMaxSize = process.env.DOCKER_LOG_MAX_SIZE?.trim() || "10m";
    const logMaxFile = process.env.DOCKER_LOG_MAX_FILE?.trim() || "3";
    await docker(
      buildDockerRunArgs({
        name,
        uid,
        gid,
        gameNetwork,
        containerMemoryMb,
        cpuArgs,
        publishArgs,
        dir,
        extraMounts: server.extraMounts,
        image,
        javaCmd: runtimeCmd,
        serverId,
        logMaxSize,
        logMaxFile,
        containerEnv: containerEnvForRuntime(server.type),
        dnsServers: bedrockDns,
      }),
      { timeout: 60_000 },
    );

    if (attachSharedDb) {
      try {
        await connectContainerToSharedNetwork(name);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.daemonSay(
          serverId,
          `WARN: could not attach shared DB network (${message}); game MySQL may be unreachable.`,
        );
      }
    }

    try {
      await this.attachToContainer(serverId, name, { waitForDone: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.daemonSay(serverId, `ERROR: ${message}`);
      this.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
      this.setStatus(serverId, "ERROR", message);
      this.daemonSay(serverId, "Server marked as OFF");
      throw err;
    }

    // Brief wait — if attach dies immediately, surface the error
    await new Promise((r) => setTimeout(r, 800));
    if (!this.processes.has(serverId)) {
      const still = await isContainerRunning(serverId).catch(() => false);
      if (!still) {
        const message = "Container exited immediately — check console logs";
        this.daemonSay(serverId, `ERROR: ${message}`);
        this.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
        this.setStatus(serverId, "ERROR", message);
        this.daemonSay(serverId, "Server marked as OFF");
        throw new Error(message);
      }
      // Container up but attach dropped — try once more
      await this.attachToContainer(serverId, name, { waitForDone: true });
    }

    // If boot log never matched (Bedrock / odd runtimes), promote when container stays up.
    setTimeout(() => {
      if (this.getStatus(serverId) !== "STARTING") return;
      void isContainerRunning(serverId).then((still) => {
        if (!still) return;
        this.daemonSay(
          serverId,
          "Server marked as RUNNING (container up; no boot line matched)",
        );
        this.setStatus(serverId, "RUNNING");
      });
    }, 45_000);
  }

  private async maybeAutoRestart(serverId: string, reason: string): Promise<void> {
    try {
      // Never revive a panel-issued stop/kill.
      if (this.intentionalStops.has(serverId)) return;

      const server = this.lastConfigs.get(serverId);
      if (!server?.autoRestart) return;

      const now = Date.now();
      const prev = this.restartAttempts.get(serverId);
      const windowMs = 15 * 60_000;
      let count = 1;
      if (prev && now - prev.at < windowMs) {
        count = prev.count + 1;
      }
      this.restartAttempts.set(serverId, { count, at: now });

      if (count > 3) {
        this.setStatus(
          serverId,
          "ERROR",
          `${reason} — auto-restart stopped after ${count} crashes in 15m`,
        );
        return;
      }

      const delayMs = Math.min(60_000, 5_000 * count);
      await new Promise((r) => setTimeout(r, delayMs));

      // Bail if someone started it manually, disabled auto-restart, or stopped it.
      if (this.intentionalStops.has(serverId)) return;
      const again = this.lastConfigs.get(serverId);
      if (!again?.autoRestart || this.processes.has(serverId)) return;
      const status = this.statuses.get(serverId);
      if (
        status === "RUNNING" ||
        status === "STARTING" ||
        status === "STOPPING" ||
        status === "STOPPED"
      ) {
        return;
      }

      this.setStatus(
        serverId,
        "STARTING",
        `Auto-restarting after crash (attempt ${count})…`,
      );
      await this.start(again);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus(serverId, "ERROR", `Auto-restart failed: ${message}`);
    }
  }

  /** Graceful stop: `stop` console command, falls back to `docker stop`. */
  async stop(serverId: string): Promise<void> {
    return stopProcess(this, serverId);
  }

  /** Immediate force-stop: docker kill + remove, no graceful `stop` command. */
  async kill(serverId: string): Promise<void> {
    return killProcess(this, serverId);
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    return sendProcessCommand(this, serverId, command);
  }

  async stopAll(): Promise<void> {
    return stopAllProcesses(this);
  }

  /**
   * Called when the daemon process itself is shutting down (deploy, crash,
   * watchdog-triggered restart, etc.) — deliberately does NOT stop managed
   * Minecraft servers. Attach clients use `--sig-proxy=false`, so killing them
   * (or exiting this process) only drops the console pipe; containers keep
   * running. The next daemon instance reattaches via `reattachOrphans()`.
   *
   * Only flushes buffered console history to disk so nothing is lost.
   */
  flushForShutdown(): void {
    for (const timer of this.persistTimers.values()) clearTimeout(timer);
    this.persistTimers.clear();
    for (const serverId of this.histories.keys()) {
      this.persistHistory(serverId);
    }
    // Drop attach clients without signalling the containers.
    for (const [serverId, managed] of this.processes) {
      this.processes.delete(serverId);
      try {
        managed.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }
}

export const processManager = new ProcessManager();

// Forward live resource samples onto the same EventEmitter used for console/status
resourceMonitor.on("stats", (serverId: string, stats: import("@msm/shared").ServerStats) => {
  processManager.emit("stats", serverId, stats);
});

const diskQuotaStopArmed = new Set<string>();
resourceMonitor.on("disk-quota-exceeded", (serverId: string) => {
  if (diskQuotaStopArmed.has(serverId)) return;
  diskQuotaStopArmed.add(serverId);
  void (async () => {
    try {
      processManager.emit(
        "output",
        serverId,
        `[${new Date().toTimeString().slice(0, 8)}] [Guartrix Daemon] Disk quota exceeded — stopping server (Wings-style enforcement).`,
        "stderr",
      );
      await processManager.kill(serverId);
    } catch {
      // ignore
    } finally {
      // Allow another stop after a restart attempt later
      setTimeout(() => diskQuotaStopArmed.delete(serverId), 60_000);
    }
  })();
});
