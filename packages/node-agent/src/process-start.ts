/**
 * Helpers for the Docker "start" path: building `docker run` arguments,
 * resolving the Java/Forge command line, and small filesystem/ports utilities
 * used only while bringing a server up. Kept separate from process-manager.ts
 * (which owns the stateful orchestration: status transitions, console history,
 * attach/adopt) so that file stays focused on lifecycle bookkeeping.
 */
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import dgram from "node:dgram";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import {
  jvmArgsFromStartupCommand,
  resolveStartupCommand,
  startupCommandToArgs,
  defaultStartupTemplateForType,
  type ServerRuntimeKind,
} from "@guartrix/shared";
import { getDiskUsageCached } from "./disk-usage.js";
import type { DaemonServerConfig } from "./process-types.js";

const execFileAsync = promisify(execFile);

export function extraVolumeArgs(mounts: DaemonServerConfig["extraMounts"]): string[] {
  if (!mounts?.length) return [];
  const args: string[] = [];
  for (const m of mounts) {
    const host = m.host?.trim();
    const container = m.container?.trim();
    if (!host || !container) continue;
    if (!host.startsWith("/") || !container.startsWith("/")) continue;
    if (container === "/data" || container.startsWith("/data/")) continue;
    if (host.includes("..") || container.includes("..")) continue;
    args.push("-v", m.readOnly ? `${host}:${container}:ro` : `${host}:${container}`);
  }
  return args;
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
    await execFileAsync("sudo", ["-n", "chmod", "-R", "u+rwX,go-rwx", dir], { timeout: 30_000 });
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

/** "Disk Usage: 512M / 80000M" line shown while a server boots. */
export async function computeDiskUsageMessage(serverId: string, dir: string): Promise<string> {
  try {
    const usage = await getDiskUsageCached(serverId);
    const limit = (await filesystemSizeBytes(dir)) ?? 80 * 1024 * 1024 * 1024;
    return `Disk Usage: ${formatDiskM(usage.totalBytes)} / ${formatDiskM(limit)}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Disk Usage: unavailable (${message})`;
  }
}

export async function checkPortFree(
  port: number,
  protocol: "tcp" | "udp" = "tcp",
): Promise<boolean> {
  if (protocol === "udp") {
    return new Promise((resolve) => {
      const socket = dgram.createSocket("udp4");
      socket.once("error", () => {
        socket.close();
        resolve(false);
      });
      socket.once("listening", () => {
        socket.close(() => resolve(true));
      });
      socket.bind(port, "0.0.0.0");
    });
  }
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

/**
 * Forge/NeoForge runtimes read JVM args from `user_jvm_args.txt` rather than
 * a command line. Writes the file and reports any safety adjustments made
 * (e.g. stripping `-XX:+AlwaysPreTouch`, which OOM-kills under Docker limits).
 */
export async function writeForgeJvmArgsFile(
  dir: string,
  server: DaemonServerConfig,
  jarName: string,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const resolvedJvm = resolveStartupCommand(
    server.startupCommand?.trim() ? server.startupCommand : "java -Xms{{MEMORY}}M -Xmx{{MEMORY}}M",
    server.memoryMb,
    jarName,
  );
  let jvmArgs = jvmArgsFromStartupCommand(resolvedJvm);
  if (jvmArgs.includes("-XX:+AlwaysPreTouch")) {
    jvmArgs = jvmArgs.filter((a) => a !== "-XX:+AlwaysPreTouch");
    warnings.push("Removed -XX:+AlwaysPreTouch from user_jvm_args.txt (Docker OOM risk).");
  }
  const lines =
    jvmArgs.length > 0 ? jvmArgs : [`-Xms${server.memoryMb}M`, `-Xmx${server.memoryMb}M`];
  await fsp.writeFile(
    path.join(dir, "user_jvm_args.txt"),
    `# JVM args managed by Guartrix\n${lines.join("\n")}\n`,
    "utf8",
  );
  return { warnings };
}

/**
 * Resolves the argv used to launch the server inside the container, stripping
 * JVM flags that are unsafe under Docker memory limits.
 */
export function resolveJavaCommand(
  server: DaemonServerConfig,
  jarName: string,
  isForgeRuntime: boolean,
): { javaCmd: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let javaCmd: string[];
  if (isForgeRuntime) {
    javaCmd = ["sh", "run.sh", "nogui"];
  } else {
    const resolved = resolveStartupCommand(server.startupCommand, server.memoryMb, jarName);
    javaCmd = startupCommandToArgs(resolved);
  }

  // AlwaysPreTouch + full Xms=Xmx commits the entire heap immediately and often
  // gets the container OOM-killed (exit 137). Strip it for Docker runs.
  if (javaCmd.includes("-XX:+AlwaysPreTouch")) {
    javaCmd = javaCmd.filter((a) => a !== "-XX:+AlwaysPreTouch");
    warnings.push("Removed -XX:+AlwaysPreTouch (unsafe with Docker memory limits; causes OOM).");
  }
  return { javaCmd, warnings };
}

/**
 * Resolves argv for any server runtime (Java, Bedrock BDS, PocketMine PHP).
 */
export function resolveRuntimeCommand(
  server: DaemonServerConfig,
  executableName: string,
  runtimeKind: ServerRuntimeKind,
  isForgeRuntime: boolean,
): { cmd: string[]; warnings: string[] } {
  const template = server.startupCommand?.trim() || defaultStartupTemplateForType(server.type);
  const patchedServer: DaemonServerConfig = {
    ...server,
    startupCommand: template,
  };
  if (runtimeKind === "java") {
    const { javaCmd, warnings } = resolveJavaCommand(patchedServer, executableName, isForgeRuntime);
    return { cmd: javaCmd, warnings };
  }
  const resolved = resolveStartupCommand(template, server.memoryMb, executableName);
  return { cmd: startupCommandToArgs(resolved), warnings: [] };
}

export interface DockerRunArgsOptions {
  name: string;
  uid: number;
  gid: number;
  gameNetwork: string;
  containerMemoryMb: number;
  cpuArgs: readonly string[];
  publishArgs: readonly string[];
  dir: string;
  extraMounts: DaemonServerConfig["extraMounts"];
  image: string;
  javaCmd: readonly string[];
  serverId: string;
  logMaxSize: string;
  logMaxFile: string;
  containerEnv?: Record<string, string>;
  dnsServers?: readonly string[];
}

/** Builds the full `docker run …` argv for a Minecraft server container. */
export function buildDockerRunArgs(opts: DockerRunArgsOptions): string[] {
  const envArgs: string[] = [];
  if (opts.containerEnv) {
    for (const [key, value] of Object.entries(opts.containerEnv)) {
      envArgs.push("-e", `${key}=${value}`);
    }
  }
  return [
    "run",
    "-d",
    "--rm",
    "--name",
    opts.name,
    "--user",
    `${opts.uid}:${opts.gid}`,
    "--network",
    opts.gameNetwork,
    "--security-opt",
    "no-new-privileges:true",
    ...(process.env.DOCKER_SECCOMP_PROFILE?.trim()
      ? ["--security-opt", `seccomp=${process.env.DOCKER_SECCOMP_PROFILE.trim()}`]
      : []),
    "--cap-drop",
    "ALL",
    "--pids-limit",
    "512",
    "--log-driver",
    "json-file",
    "--log-opt",
    `max-size=${opts.logMaxSize}`,
    "--log-opt",
    `max-file=${opts.logMaxFile}`,
    "--label",
    "guartrix=1",
    "--label",
    `guartrix.server=${opts.serverId}`,
    "--memory",
    `${opts.containerMemoryMb}m`,
    "--memory-swap",
    `${opts.containerMemoryMb}m`,
    ...opts.cpuArgs,
    ...opts.publishArgs,
    ...(opts.dnsServers ?? []).flatMap((dns) => ["--dns", dns]),
    ...envArgs,
    "-v",
    `${opts.dir}:/data`,
    ...extraVolumeArgs(opts.extraMounts),
    "-w",
    "/data",
    "-i",
    opts.image,
    ...opts.javaCmd,
  ];
}
