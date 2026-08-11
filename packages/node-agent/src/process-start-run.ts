/**
 * Start-orchestration path: validate config, rebuild the Docker container,
 * attach the console, and promote RUNNING. Extracted from process-manager.ts
 * so that file stays a thin facade over lifecycle / attach / console helpers.
 *
 * Operates on a `StartHost` — the slice of ProcessManager state and helpers
 * this path needs — rather than a concrete class.
 */
import fs from "node:fs";
import path from "node:path";
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
} from "@guartrix/shared";
import { serverDir } from "./config.js";
import { setServerDataRoot } from "./server-locations.js";
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
import { writeServerLimits, isOverDiskQuota, cpuLimitToDockerCpus } from "./disk-quota.js";
import { ensureDefaultServerIcon } from "./default-icon.js";
import {
  ensureBdsBootProperties,
  bedrockContainerDnsServers,
  ensureBedrockRuntimeImage,
  bedrockRuntimeImageExists,
} from "./bedrock-boot.js";
import {
  buildDockerRunArgs,
  fixDataOwnership,
  resolveRuntimeCommand,
  writeForgeJvmArgsFile,
} from "./process-start.js";
import { attachToContainer, type AttachHost } from "./process-attach.js";
import { emitDiskUsage, emitStartupBanner } from "./process-console.js";
import type { DaemonPortPublish, DaemonServerConfig } from "./process-types.js";

export interface StartHost extends AttachHost {
  isPortFree(port: number, protocol?: "tcp" | "udp"): Promise<boolean>;
  adoptRunning(serverId: string): Promise<boolean>;
}

export function formatPublishPorts(ports: DaemonPortPublish[]): string {
  return ports.map((p) => `${p.port}/${p.protocol}`).join(", ");
}

export function publishPortsEqual(a: DaemonPortPublish[], b: DaemonPortPublish[]): boolean {
  if (a.length !== b.length) return false;
  const key = (p: DaemonPortPublish) => `${p.port}/${p.protocol}`;
  const setA = new Set(a.map(key));
  return b.every((p) => setA.has(key(p)));
}

export function resolvePublishPorts(server: DaemonServerConfig): DaemonPortPublish[] {
  return server.ports && server.ports.length > 0
    ? server.ports
    : [{ port: server.port, protocol: "tcp" }];
}

export async function startProcess(host: StartHost, server: DaemonServerConfig): Promise<void> {
  const serverId = server.id;

  if (server.dataRoot !== undefined) {
    await setServerDataRoot(serverId, server.dataRoot);
  }

  const failStart = (message: string): never => {
    host.daemonSay(serverId, `ERROR: ${message}`);
    host.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
    host.setStatus(serverId, "ERROR", message);
    throw new Error(message);
  };

  // Idempotent start: never flip a live process to ERROR just because Start
  // was clicked twice, raced with auto-start, or the UI had a stale status.
  if (host.processes.has(serverId)) {
    host.lastConfigs.set(serverId, { ...server });
    host.daemonSay(serverId, "Already running — ignoring duplicate start.");
    host.setStatus(serverId, "RUNNING", null);
    return;
  }

  // Container survived a panel/daemon restart — just reclaim the console.
  if (await isContainerRunning(serverId).catch(() => false)) {
    host.lastConfigs.set(serverId, { ...server });
    await host.adoptRunning(serverId);
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

  const prevConfig = host.lastConfigs.get(serverId);
  host.lastConfigs.set(serverId, { ...server });

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
      failStart(`${BEDROCK_BINARY} not found — recreate the server or reinstall BDS`);
    }
  } else if (runtimeKind === "php") {
    if (!fs.existsSync(executablePath)) {
      failStart(`${POCKETMINE_PHAR} not found — recreate the server or reinstall PocketMine`);
    }
  } else if (!isForgeRuntime && !fs.existsSync(executablePath)) {
    failStart(`${executableName} not found — upload the jar or fix Server Jar File`);
  }
  if (isForgeRuntime && !fs.existsSync(runShPath)) {
    failStart("Forge run.sh not found — recreate the server");
  }

  const publishPorts: DaemonPortPublish[] = resolvePublishPorts(server);
  for (const p of publishPorts) {
    const portFree = await host.isPortFree(p.port, p.protocol);
    if (!portFree) {
      failStart(`Port ${p.port}/${p.protocol} is already in use`);
    }
  }
  const publishArgs = publishPorts.flatMap((p) => ["-p", `${p.port}:${p.port}/${p.protocol}`]);

  const prev = prevConfig;
  if (prev) {
    const prevPorts = resolvePublishPorts(prev);
    if (!publishPortsEqual(prevPorts, publishPorts)) {
      host.daemonSay(
        serverId,
        `NOTICE: Your server port was changed while the server was stopped. Host firewall rules were verified and Docker is being rebuilt with the new port binding(s) before startup.`,
      );
      host.daemonSay(
        serverId,
        `NOTICE: Port(s) now: ${formatPublishPorts(publishPorts)} (previously: ${formatPublishPorts(prevPorts)}).`,
      );
    }
  }
  for (const notice of server.startupNotices ?? []) {
    host.daemonSay(serverId, `NOTICE: ${notice}`);
  }

  const name = containerName(serverId);

  await writeServerLimits(serverId, {
    diskMb: server.diskMb ?? 10_240,
    cpuLimit: server.cpuLimit ?? 0,
  });

  if (await isOverDiskQuota(serverId)) {
    failStart(`Disk quota exceeded — free space or raise the disk limit before starting`);
  }

  host.setStatus(serverId, "STARTING", null);
  host.daemonSay(serverId, "Server marked as STARTING");
  host.daemonSay(
    serverId,
    "Your server container needs to be rebuilt. This should only take a few seconds, but could take a few minutes. You do not need to do anything else while this occurs. Your server will automatically continue with startup once this process is completed.",
  );
  host.daemonSay(serverId, "Server marked as STOPPING");
  host.daemonSay(serverId, "Server marked as OFF");

  host.daemonSay(serverId, "Rebuilding server container...");
  await removeContainer(serverId);
  host.daemonSay(serverId, "New container built, rotating hamsters...");
  host.daemonSay(serverId, "Container is being initialized...");
  host.daemonSay(serverId, "Completed rebuild process for server. Server is now booting.");
  host.daemonSay(serverId, "Server marked as STARTING");

  await emitDiskUsage(host, serverId);

  host.daemonSay(serverId, "Ensuring correct ownership of files.");
  await fixDataOwnership(dir);

  host.daemonSay(serverId, "Running server preflight.");
  await ensureDockerReady();
  if (runtimeKind === "bedrock_native") {
    const needsBuild = !(await bedrockRuntimeImageExists());
    if (needsBuild) {
      host.daemonSay(serverId, "Building Bedrock runtime image (first time only, ~1–2 minutes)…");
      await ensureBedrockRuntimeImage();
      host.daemonSay(serverId, "Bedrock runtime image ready.");
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
    for (const warning of warnings) host.daemonSay(serverId, warning);
  }

  const { cmd: runtimeCmd, warnings: runtimeWarnings } = resolveRuntimeCommand(
    server,
    executableName,
    runtimeKind,
    isForgeRuntime,
  );
  for (const warning of runtimeWarnings) host.daemonSay(serverId, warning);

  host.daemonSay(
    serverId,
    `Using ${runtimeLabelForServerType(server.type, server.javaVersion)} (${image}) · ${runtimeCmd.join(" ")}`,
  );

  if (runtimeKind === "bedrock_native") {
    const bootWarnings = await ensureBdsBootProperties(dir, server.port);
    for (const w of bootWarnings) host.daemonSay(serverId, w);
  }

  host.daemonSay(serverId, "Starting server container.");
  await emitStartupBanner(host, serverId, runtimeCmd);

  const { primary: gameNetwork, attachSharedDb } =
    runtimeKind === "bedrock_native"
      ? await (async () => {
          await ensureGuartrixNetwork();
          return { primary: GUARTRIX_NETWORK, attachSharedDb: false };
        })()
      : await resolveGameNetwork(serverId);

  const bedrockDns = runtimeKind === "bedrock_native" ? await bedrockContainerDnsServers() : [];

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
      host.daemonSay(
        serverId,
        `WARN: could not attach shared DB network (${message}); game MySQL may be unreachable.`,
      );
    }
  }

  try {
    await attachToContainer(host, serverId, name, { waitForDone: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    host.daemonSay(serverId, `ERROR: ${message}`);
    host.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
    host.setStatus(serverId, "ERROR", message);
    host.daemonSay(serverId, "Server marked as OFF");
    throw err;
  }

  // Brief wait — if attach dies immediately, surface the error
  await new Promise((r) => setTimeout(r, 800));
  if (!host.processes.has(serverId)) {
    const still = await isContainerRunning(serverId).catch(() => false);
    if (!still) {
      const message = "Container exited immediately — check console logs";
      host.daemonSay(serverId, `ERROR: ${message}`);
      host.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
      host.setStatus(serverId, "ERROR", message);
      host.daemonSay(serverId, "Server marked as OFF");
      throw new Error(message);
    }
    // Container up but attach dropped — try once more
    await attachToContainer(host, serverId, name, { waitForDone: true });
  }

  // If boot log never matched (Bedrock / odd runtimes), promote when container stays up.
  setTimeout(() => {
    if (host.getStatus(serverId) !== "STARTING") return;
    void isContainerRunning(serverId).then((still) => {
      if (!still) return;
      host.daemonSay(serverId, "Server marked as RUNNING (container up; no boot line matched)");
      host.setStatus(serverId, "RUNNING");
    });
  }, 45_000);
}
