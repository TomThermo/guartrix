import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { ServerStatus } from "@msm/shared";
import {
  assertSafeStartupCommandForType,
  BEDROCK_BINARY,
  containerEnvForRuntime,
  defaultServerExecutable,
  dockerImageForServerType,
  normalizeServerExecutable,
  POCKETMINE_PHAR,
  runtimeKindFor,
  runtimeLabelForServerType,
} from "@msm/shared";
import { serverDir } from "./config.js";
import {
  containerName,
  docker,
  ensureDockerReady,
  ensureJavaImage,
  isContainerRunning,
  removeContainer,
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
import { ensureDefaultServerIcon } from "./default-icon.js";
import {
  ensureBdsBootProperties,
  bedrockContainerDnsServers,
  ensureBedrockRuntimeImage,
  bedrockRuntimeImageExists,
} from "./bedrock-boot.js";
import {
  stopProcess,
  killProcess,
  sendProcessCommand,
  stopAllProcesses,
} from "./process-lifecycle.js";
import {
  buildDockerRunArgs,
  checkPortFree,
  fixDataOwnership,
  resolveRuntimeCommand,
  writeForgeJvmArgsFile,
} from "./process-start.js";
import {
  adoptRunning as adoptRunningFn,
  attachToContainer,
  reattachOrphans as reattachOrphansFn,
} from "./process-attach.js";
import {
  daemonSay as daemonSayFn,
  emitDiskUsage,
  emitStartupBanner,
  getConsoleHistory,
  persistConsoleHistory,
  pushConsoleLine as pushConsoleLineFn,
} from "./process-console.js";
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

class ProcessManager extends EventEmitter {
  // Note: `processes` / `intentionalStops` / `restartAttempts` / console maps
  // and the daemonSay/setStatus/persistHistory methods below are intentionally
  // not `private` — process-lifecycle.ts / process-console.ts / process-attach.ts
  // need to read and mutate them via host interfaces. This class remains the
  // only place that constructs/owns that state; nothing outside this package
  // touches them.
  processes = new Map<string, ManagedProcess>();
  /** Survives stop/exit so the console still shows output when the server is offline. */
  histories = new Map<string, string[]>();
  persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Last start config per server — used for auto-restart without a DB. */
  lastConfigs = new Map<string, DaemonServerConfig>();
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
    return getConsoleHistory(this, serverId);
  }

  persistHistory(serverId: string): void {
    persistConsoleHistory(this, serverId);
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

  pushConsoleLine(
    serverId: string,
    line: string,
    stream: "stdout" | "stderr" = "stdout",
  ): void {
    pushConsoleLineFn(this, serverId, line, stream);
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

  daemonSay(serverId: string, message: string): void {
    daemonSayFn(this, serverId, message);
  }

  /**
   * If the Minecraft container is already running (e.g. after a panel/daemon
   * restart) but we have no stdin handle, reattach so commands work again.
   */
  async adoptRunning(serverId: string): Promise<boolean> {
    return adoptRunningFn(this, serverId);
  }

  /** On daemon boot: reclaim every live Guartrix Minecraft container. */
  async reattachOrphans(): Promise<number> {
    return reattachOrphansFn(this);
  }

  async start(server: DaemonServerConfig): Promise<void> {
    const serverId = server.id;

    const failStart = (message: string): never => {
      this.daemonSay(serverId, `ERROR: ${message}`);
      this.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
      this.setStatus(serverId, "ERROR", message);
      throw new Error(message);
    };

    // Idempotent start: never flip a live process to ERROR just because Start
    // was clicked twice, raced with auto-start, or the UI had a stale status.
    if (this.processes.has(serverId)) {
      this.lastConfigs.set(serverId, { ...server });
      this.daemonSay(serverId, "Already running — ignoring duplicate start.");
      this.setStatus(serverId, "RUNNING", null);
      return;
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

    await emitDiskUsage(this, serverId);

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
    const containerMemoryMb =
      server.memoryMb + Math.max(1024, Math.ceil(server.memoryMb * 0.1));
    const cpus = cpuLimitToDockerCpus(server.cpuLimit ?? 0);
    const cpuArgs = cpus ? (["--cpus", cpus] as const) : [];
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const gid = typeof process.getgid === "function" ? process.getgid() : 1000;

    if (isForgeRuntime) {
      const { warnings } = await writeForgeJvmArgsFile(
        dir,
        server,
        executableName,
      );
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
    await emitStartupBanner(this, serverId, runtimeCmd);

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
      await attachToContainer(this, serverId, name, { waitForDone: true });
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
      await attachToContainer(this, serverId, name, { waitForDone: true });
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

  async maybeAutoRestart(serverId: string, reason: string): Promise<void> {
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
