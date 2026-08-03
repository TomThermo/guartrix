import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import type { ServerStatus, ServerType } from "@msm/shared";
import {
  assertSafeStartupCommand,
  dockerImageForJava,
  jvmArgsFromStartupCommand,
  normalizeJavaVersion,
  normalizeServerJar,
  resolveStartupCommand,
  startupCommandToArgs,
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
import { ensureGuartrixNetwork, GUARTRIX_NETWORK } from "./mysql.js";
import { getDiskUsageCached, invalidateDiskUsage } from "./disk-usage.js";
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
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DaemonPortPublish {
  port: number;
  protocol: "tcp" | "udp";
}

export interface DaemonServerConfig {
  id: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  memoryMb: number;
  autoRestart: boolean;
  /** Major Java version ("8"|"11"|"17"|"21"|"25"). */
  javaVersion?: string | null;
  /** Startup template; null = default. */
  startupCommand?: string | null;
  /** Jar filename; null = server.jar. */
  serverJar?: string | null;
  /** Disk quota MB (0 = unlimited). */
  diskMb?: number;
  /** CPU percent of one core (100 = 1.0); 0 = unlimited. */
  cpuLimit?: number;
  /** All host ports to publish (primary + extras). Defaults to primary TCP. */
  ports?: DaemonPortPublish[];
}

export async function fixDataOwnership(dir: string): Promise<boolean> {
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;
  try {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await execFileAsync("sudo", ["-n", "chown", "-R", `${uid}:${gid}`, dir], {
      timeout: 30_000,
    });
    // Owner-only: no group/other read (panel users access only via API auth)
    await execFileAsync(
      "sudo",
      ["-n", "chmod", "-R", "u+rwX,go-rwx", dir],
      { timeout: 30_000 },
    );
    await execFileAsync("sudo", ["-n", "chmod", "700", dir], {
      timeout: 10_000,
    }).catch(() => undefined);
    return true;
  } catch {
    try {
      await fsp.chmod(dir, 0o700).catch(() => undefined);
    } catch {
      // ignore
    }
    return false;
  }
}

function formatDiskM(bytes: number): string {
  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))}M`;
}

async function filesystemSizeBytes(dir: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("df", ["-B1", "--output=size", dir], {
      timeout: 10_000,
    });
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const n = Number(lines[lines.length - 1]?.replace(/\D/g, "") || "");
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

const MAX_HISTORY = 500;
const STOP_TIMEOUT_MS = 20_000;
const CONSOLE_HISTORY_FILE = "guartrix-console-history.json";

interface ManagedProcess {
  process: ChildProcessWithoutNullStreams;
  container: string;
  onlinePlayers: Set<string>;
}

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
  private processes = new Map<string, ManagedProcess>();
  /** Survives stop/exit so the console still shows output when the server is offline. */
  private histories = new Map<string, string[]>();
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Last start config per server — used for auto-restart without a DB. */
  private lastConfigs = new Map<string, DaemonServerConfig>();
  private restartAttempts = new Map<string, { count: number; at: number }>();
  private statuses = new Map<string, ServerStatus>();
  /** Panel-issued stop/kill — never treat the following exit as a crash. */
  private intentionalStops = new Set<string>();

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

  private persistHistory(serverId: string): void {
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
      line.match(/\b([A-Za-z0-9_]{3,16}) logged in with entity id\b/);
    if (join?.[1]) {
      managed.onlinePlayers.add(join[1]);
      void recordPlayerJoin(serverId, join[1]);
      this.emit("players", serverId, this.getOnlinePlayerNames(serverId));
      return;
    }

    const leave =
      line.match(/\b([A-Za-z0-9_]{3,16}) left the game\b/) ??
      line.match(/\b([A-Za-z0-9_]{3,16}) lost connection:/) ??
      line.match(/\b([A-Za-z0-9_]{3,16}) was kicked\b/);
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

  private setStatus(
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

  async isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port, "0.0.0.0");
    });
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

  private daemonSay(serverId: string, message: string): void {
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
    try {
      const usage = await getDiskUsageCached(serverId);
      const limit =
        (await filesystemSizeBytes(serverDir(serverId))) ??
        80 * 1024 * 1024 * 1024;
      this.daemonSay(
        serverId,
        `Disk Usage: ${formatDiskM(usage.totalBytes)} / ${formatDiskM(limit)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.daemonSay(serverId, `Disk Usage: unavailable (${message})`);
    }
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
    try {
      const { stdout, stderr } = await docker(
        ["run", "--rm", config.dockerImage, "java", "-version"],
        { timeout: 20_000 },
      );
      const text = `${stderr || ""}${stdout || ""}`;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) this.pushConsoleLine(serverId, line.trim());
      }
    } catch {
      // java -version is best-effort
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

    const handleChunk = (stream: "stdout" | "stderr") => (data: Buffer) => {
      const text = data.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line === "") continue;
        this.appendHistory(serverId, line);
        if (
          !sawDone &&
          /Done\s*\([\d.]+s\)!/i.test(line)
        ) {
          sawDone = true;
          this.daemonSay(serverId, "Server marked as RUNNING");
          this.setStatus(serverId, "RUNNING");
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
            // Intentional stop() already announces OFF after wait — avoid duplicate lines.
            if (this.getStatus(serverId) !== "STOPPING") {
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
          if (this.getStatus(serverId) !== "STOPPING") {
            this.daemonSay(serverId, "Server marked as OFF");
          }
          this.setStatus(serverId, "ERROR", message);
          void this.maybeAutoRestart(serverId, message);
        })
        .catch(() => {
          if (this.getStatus(serverId) !== "STOPPING") {
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
      assertSafeStartupCommand(
        server.startupCommand,
        server.memoryMb,
        server.serverJar ?? undefined,
      );
    } catch (err) {
      failStart(err instanceof Error ? err.message : String(err));
    }

    this.lastConfigs.set(serverId, { ...server });

    const dir = serverDir(serverId);
    let jarName = "server.jar";
    try {
      jarName = normalizeServerJar(server.serverJar);
    } catch (err) {
      failStart(err instanceof Error ? err.message : String(err));
    }
    const jarPath = path.join(dir, jarName);
    const runShPath = path.join(dir, "run.sh");
    const isForgeRuntime =
      (server.type === "FORGE" || server.type === "NEOFORGE") &&
      fs.existsSync(runShPath);
    if (!isForgeRuntime && !fs.existsSync(jarPath)) {
      failStart(
        `${jarName} not found — upload the jar or fix Server Jar File`,
      );
    }
    if (isForgeRuntime && !fs.existsSync(runShPath)) {
      failStart("Forge run.sh not found — recreate the server");
    }

    const publishPorts: DaemonPortPublish[] =
      server.ports && server.ports.length > 0
        ? server.ports
        : [{ port: server.port, protocol: "tcp" }];
    for (const p of publishPorts) {
      const portFree = await this.isPortFree(p.port);
      if (!portFree) {
        failStart(`Port ${p.port}/${p.protocol} is already in use`);
      }
    }
    const publishArgs = publishPorts.flatMap((p) => [
      "-p",
      `${p.port}:${p.port}/${p.protocol}`,
    ]);

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
    const javaVersion = normalizeJavaVersion(server.javaVersion);
    const image = dockerImageForJava(javaVersion);
    await ensureJavaImage(image);
    await ensureDefaultServerIcon(serverId);

    // Docker memory limit must cover heap + metaspace + native + threads.
    // AlwaysPreTouch + Xms=Xmx needs even more; 512MB was too tight for large heaps.
    const containerMemoryMb = server.memoryMb + Math.max(1024, Math.ceil(server.memoryMb * 0.1));
    const cpus = cpuLimitToDockerCpus(server.cpuLimit ?? 0);
    const cpuArgs = cpus ? (["--cpus", cpus] as const) : [];
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const gid = typeof process.getgid === "function" ? process.getgid() : 1000;

    if (isForgeRuntime) {
      const resolvedJvm = resolveStartupCommand(
        server.startupCommand?.trim()
          ? server.startupCommand
          : "java -Xms{{MEMORY}}M -Xmx{{MEMORY}}M",
        server.memoryMb,
        jarName,
      );
      let jvmArgs = jvmArgsFromStartupCommand(resolvedJvm);
      if (jvmArgs.includes("-XX:+AlwaysPreTouch")) {
        jvmArgs = jvmArgs.filter((a) => a !== "-XX:+AlwaysPreTouch");
        this.daemonSay(
          serverId,
          "Removed -XX:+AlwaysPreTouch from user_jvm_args.txt (Docker OOM risk).",
        );
      }
      const lines =
        jvmArgs.length > 0
          ? jvmArgs
          : [`-Xms${server.memoryMb}M`, `-Xmx${server.memoryMb}M`];
      await fsp.writeFile(
        path.join(dir, "user_jvm_args.txt"),
        `# JVM args managed by Guartrix\n${lines.join("\n")}\n`,
        "utf8",
      );
    }

    let javaCmd: string[];
    if (isForgeRuntime) {
      javaCmd = ["sh", "run.sh", "nogui"];
    } else {
      const resolved = resolveStartupCommand(
        server.startupCommand,
        server.memoryMb,
        jarName,
      );
      javaCmd = startupCommandToArgs(resolved);
    }

    // AlwaysPreTouch + full Xms=Xmx commits the entire heap immediately and often
    // gets the container OOM-killed (exit 137). Strip it for Docker runs.
    if (javaCmd.includes("-XX:+AlwaysPreTouch")) {
      javaCmd = javaCmd.filter((a) => a !== "-XX:+AlwaysPreTouch");
      this.daemonSay(
        serverId,
        "Removed -XX:+AlwaysPreTouch (unsafe with Docker memory limits; causes OOM).",
      );
    }

    this.daemonSay(
      serverId,
      `Using Java ${javaVersion} (${image}) · ${javaCmd.join(" ")}`,
    );

    this.daemonSay(serverId, "Starting server container.");
    await this.emitStartupBanner(serverId, javaCmd);

    await ensureGuartrixNetwork();

    // Detached run: the container outlives the daemon. Console I/O goes through
    // `docker attach --sig-proxy=false` so a panel restart never kills Minecraft.
    const logMaxSize = process.env.DOCKER_LOG_MAX_SIZE?.trim() || "10m";
    const logMaxFile = process.env.DOCKER_LOG_MAX_FILE?.trim() || "3";
    await docker(
      [
        "run",
        "-d",
        "--rm",
        "--name",
        name,
        "--user",
        `${uid}:${gid}`,
        "--network",
        GUARTRIX_NETWORK,
        "--security-opt",
        "no-new-privileges:true",
        "--cap-drop",
        "ALL",
        "--pids-limit",
        "512",
        "--log-driver",
        "json-file",
        "--log-opt",
        `max-size=${logMaxSize}`,
        "--log-opt",
        `max-file=${logMaxFile}`,
        "--label",
        "guartrix=1",
        "--label",
        `guartrix.server=${serverId}`,
        "--memory",
        `${containerMemoryMb}m`,
        "--memory-swap",
        `${containerMemoryMb}m`,
        ...cpuArgs,
        ...publishArgs,
        "-v",
        `${dir}:/data`,
        "-w",
        "/data",
        "-i",
        image,
        ...javaCmd,
      ],
      { timeout: 60_000 },
    );

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

    // Stay STARTING until the JVM prints Done — avoid flooding commands into
    // stdin before the command dispatcher is ready (causes "unexpected error").
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

  async stop(serverId: string): Promise<void> {
    const managed = this.processes.get(serverId);
    const name = managed?.container ?? containerName(serverId);

    this.intentionalStops.add(serverId);
    this.restartAttempts.delete(serverId);

    if (!managed) {
      this.daemonSay(serverId, "Server marked as OFF");
      await removeContainer(serverId);
      this.setStatus(serverId, "STOPPED", null);
      this.intentionalStops.delete(serverId);
      return;
    }

    this.setStatus(serverId, "STOPPING");
    this.daemonSay(serverId, "Server marked as STOPPING");

    try {
      managed.process.stdin.write("stop\n");
    } catch {
      // ignore
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        void docker(["stop", "-t", "5", name]).finally(() => {
          try {
            managed.process.kill("SIGTERM");
          } catch {
            // ignore
          }
          setTimeout(() => {
            void removeContainer(serverId).finally(resolve);
          }, 2000);
        });
      }, STOP_TIMEOUT_MS);

      managed.process.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.processes.delete(serverId);
    this.persistHistory(serverId);
    await removeContainer(serverId);
    this.daemonSay(serverId, "Server marked as OFF");
    this.setStatus(serverId, "STOPPED", null);
    // Keep the flag briefly so a late attach-exit handler cannot auto-restart.
    setTimeout(() => this.intentionalStops.delete(serverId), 60_000);
  }

  /** Immediate force-stop: docker kill + remove, no graceful `stop` command. */
  async kill(serverId: string): Promise<void> {
    const managed = this.processes.get(serverId);
    const name = managed?.container ?? containerName(serverId);

    this.intentionalStops.add(serverId);
    this.restartAttempts.delete(serverId);
    this.setStatus(serverId, "STOPPING");
    this.daemonSay(serverId, "Server marked as KILLING");
    this.daemonSay(serverId, "Force-killing Docker container...");

    // Drop from map first so the exit handler does not auto-restart
    this.processes.delete(serverId);

    try {
      await docker(["kill", name], { timeout: 15_000 });
    } catch {
      try {
        await docker(["rm", "-f", name], { timeout: 15_000 });
      } catch {
        // already gone
      }
    }

    if (managed) {
      try {
        managed.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }

    this.persistHistory(serverId);
    await removeContainer(serverId);
    this.daemonSay(serverId, "Server marked as OFF");
    this.setStatus(serverId, "STOPPED", null);
    setTimeout(() => this.intentionalStops.delete(serverId), 60_000);
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    const cleaned = command.replace(/[\r\n]/g, "").trim();
    if (!cleaned) return;
    if (/[;&|`$<>\\]/.test(cleaned)) {
      throw new Error("Invalid characters in command");
    }

    if (!this.processes.has(serverId)) {
      const ok = await this.adoptRunning(serverId);
      if (!ok) throw new Error("Server is not running");
    }

    const managed = this.processes.get(serverId);
    if (!managed) throw new Error("Server is not running");
    managed.process.stdin.write(cleaned + "\n");
  }

  async stopAll(): Promise<void> {
    const ids = [...this.processes.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
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
