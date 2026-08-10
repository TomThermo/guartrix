import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatBytes as sharedFormatBytes } from "@guartrix/shared";
import { config } from "./config.js";

const execFileAsync = promisify(execFile);

export function containerName(serverId: string): string {
  return `guartrix-${serverId}`;
}

/** Pre-rename container names (BlockHost → Guartrix). */
function legacyContainerName(serverId: string): string {
  return `blockhost-${serverId}`;
}

async function docker(
  args: string[],
  opts?: { timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("sudo", ["-n", "docker", ...args], {
      timeout: opts?.timeout ?? 60_000,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = [e.stderr, e.stdout, e.message].filter(Boolean).join(" | ");
    throw new Error(`Docker failed (${args.slice(0, 4).join(" ")}…): ${detail}`);
  }
}

async function containerListed(name: string): Promise<boolean> {
  const { stdout } = await docker([
    "ps",
    "-a",
    "--filter",
    `name=^${name}$`,
    "--format",
    "{{.Names}}",
  ]);
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .includes(name);
}

/** Prefer the new name; fall back to legacy BlockHost containers still running. */
export async function resolveContainerName(serverId: string): Promise<string | null> {
  const modern = containerName(serverId);
  if (await containerListed(modern)) return modern;
  const legacy = legacyContainerName(serverId);
  if (await containerListed(legacy)) return legacy;
  return null;
}

export async function ensureDockerReady(): Promise<void> {
  await docker(["info"], { timeout: 15_000 });
}

export async function ensureJavaImage(image?: string): Promise<void> {
  const target = image?.trim() || config.dockerImage;
  const { stdout } = await docker(["images", "-q", target]);
  if (stdout.trim()) return;
  await docker(["pull", target], { timeout: 300_000 });
}

export async function removeContainer(serverId: string): Promise<void> {
  for (const name of [containerName(serverId), legacyContainerName(serverId)]) {
    try {
      await docker(["rm", "-f", name], { timeout: 30_000 });
    } catch {
      // already gone
    }
  }
}

export async function containerExists(serverId: string): Promise<boolean> {
  return (await resolveContainerName(serverId)) != null;
}

export async function isNamedContainerRunning(name: string): Promise<boolean> {
  const { stdout } = await docker([
    "ps",
    "--filter",
    `name=^${name}$`,
    "--filter",
    "status=running",
    "--format",
    "{{.Names}}",
  ]);
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .includes(name);
}

export async function isContainerRunning(serverId: string): Promise<boolean> {
  for (const name of [containerName(serverId), legacyContainerName(serverId)]) {
    if (await isNamedContainerRunning(name)) return true;
  }
  return false;
}

/**
 * Remove leftover (stopped/exited) Minecraft server containers, e.g. after a
 * crash left a dead container behind with a name that would otherwise
 * collide on next start (never touches MySQL).
 *
 * IMPORTANT: only removes containers that are NOT currently running. This
 * function is called on every API startup (including automatic restarts by
 * the watchdog), so it must never force-remove a container that is actively
 * running a live server — that would kill the Minecraft server itself every
 * time the panel restarts.
 */
export async function cleanupLeftoverContainers(): Promise<number> {
  let removed = 0;
  for (const label of ["guartrix.server", "blockhost=1"]) {
    const filter = label === "guartrix.server" ? "label=guartrix.server" : `label=${label}`;
    const { stdout: allOut } = await docker(["ps", "-aq", "--filter", filter]);
    const allIds = allOut.trim().split(/\r?\n/).filter(Boolean);
    if (!allIds.length) continue;

    const { stdout: runningOut } = await docker(["ps", "-q", "--filter", filter]);
    const runningIds = new Set(runningOut.trim().split(/\r?\n/).filter(Boolean));

    const staleIds = allIds.filter((id) => !runningIds.has(id));
    if (staleIds.length) {
      await docker(["rm", "-f", ...staleIds]);
      removed += staleIds.length;
    }
  }
  return removed;
}

export function parseDockerSize(input: string): number {
  const cleaned = input.trim().replace(/,/g, "");
  if (!cleaned || cleaned === "0") return 0;
  const match = cleaned.match(/^([\d.]+)\s*([KMGTP]?i?B)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  const map: Record<string, number> = {
    B: 1,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
  };
  return value * (map[unit] ?? 1);
}

export function formatBytes(bytes: number): string {
  return sharedFormatBytes(bytes);
}

export interface DockerStatsRaw {
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
  NetIO: string;
  BlockIO: string;
  PIDs: string;
  Name: string;
}

export async function getStatsByName(name: string): Promise<DockerStatsRaw | null> {
  try {
    const { stdout } = await docker(["stats", name, "--no-stream", "--format", "{{json .}}"], {
      timeout: 10_000,
    });
    const line = stdout.trim().split(/\r?\n/)[0];
    if (!line) return null;
    return JSON.parse(line) as DockerStatsRaw;
  } catch {
    return null;
  }
}

export async function getContainerStats(serverId: string): Promise<DockerStatsRaw | null> {
  const name = (await resolveContainerName(serverId)) ?? containerName(serverId);
  return getStatsByName(name);
}

/** `docker stats` for several containers at once — one process spawn instead of N. */
export async function getStatsForContainers(names: string[]): Promise<Map<string, DockerStatsRaw>> {
  const result = new Map<string, DockerStatsRaw>();
  if (!names.length) return result;
  try {
    const { stdout } = await docker(["stats", ...names, "--no-stream", "--format", "{{json .}}"], {
      timeout: 15_000,
    });
    for (const line of stdout.trim().split(/\r?\n/)) {
      if (!line) continue;
      try {
        const raw = JSON.parse(line) as DockerStatsRaw;
        result.set(raw.Name, raw);
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // return whatever we have (empty on total failure)
  }
  return result;
}

export interface NormalizedContainerStats {
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
}

/**
 * Normalize raw `docker stats` output. CPU% is per-core relative, so a
 * container using all cores on a 6-core host can show ~600% — divide by the
 * host core count so the value represents overall machine load (0-100%).
 */
export function normalizeContainerStats(
  raw: DockerStatsRaw,
  cpuCount: number,
): NormalizedContainerStats {
  const rawCpuPercent = Number.parseFloat(raw.CPUPerc.replace("%", "")) || 0;
  const cpuPercent = Math.min(100, rawCpuPercent / Math.max(cpuCount, 1));
  const memPercent = Number.parseFloat(raw.MemPerc.replace("%", "")) || 0;
  const [memUsedRaw, memLimitRaw] = raw.MemUsage.split("/").map((s) => s.trim());
  const [blkReadRaw, blkWriteRaw] = raw.BlockIO.split("/").map((s) => s.trim());
  return {
    cpuPercent,
    memoryUsedBytes: parseDockerSize(memUsedRaw ?? "0B"),
    memoryLimitBytes: parseDockerSize(memLimitRaw ?? "0B"),
    memoryPercent: memPercent,
    blockReadBytes: parseDockerSize(blkReadRaw ?? "0B"),
    blockWriteBytes: parseDockerSize(blkWriteRaw ?? "0B"),
    pids: Number.parseInt(raw.PIDs, 10) || 0,
  };
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  /** Docker "State" — running, exited, created, restarting, ... */
  state: string;
  /** Human status string, e.g. "Up 3 hours" or "Exited (0) 2 days ago". */
  status: string;
  createdAt: string;
  /** Published port mappings, e.g. "0.0.0.0:25565->25565/tcp". */
  ports: string;
  /** Server id parsed from the `guartrix.server` label, null for non-server containers. */
  serverId: string | null;
  isMysql: boolean;
}

function parseDockerLabels(raw: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx === -1) {
      labels[pair] = "";
    } else {
      labels[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }
  return labels;
}

/** List every container managed by this daemon (Minecraft servers + MySQL). */
export async function listGuartrixContainers(): Promise<ContainerSummary[]> {
  const { stdout } = await docker([
    "ps",
    "-a",
    "--filter",
    "label=guartrix=1",
    "--format",
    "{{json .}}",
  ]);
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const raw = JSON.parse(line) as {
      ID: string;
      Image: string;
      Names: string;
      State: string;
      Status: string;
      CreatedAt: string;
      Ports: string;
      Labels: string;
    };
    const labels = parseDockerLabels(raw.Labels ?? "");
    return {
      id: raw.ID,
      name: raw.Names,
      image: raw.Image,
      state: raw.State,
      status: raw.Status,
      createdAt: raw.CreatedAt,
      ports: raw.Ports ?? "",
      serverId: labels["guartrix.server"] || null,
      isMysql: labels["guartrix.mysql"] === "1",
    };
  });
}

/** Docker engine version string, e.g. "27.3.1" ("unknown" if it can't be read). */
export async function getDockerVersion(): Promise<string> {
  try {
    const { stdout } = await docker(["version", "--format", "{{.Server.Version}}"]);
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Tail recent lines from a container's docker logs (non-follow). */
export async function getContainerLogs(name: string, tail = 200): Promise<string[]> {
  const n = Math.max(1, Math.min(2000, Math.floor(tail)));
  try {
    const { stdout, stderr } = await docker(["logs", "--tail", String(n), name], {
      timeout: 15_000,
    });
    const text = `${stdout || ""}${stderr || ""}`;
    return text
      .split(/\r?\n/)
      .filter((line) => line !== "")
      .slice(-n);
  } catch {
    return [];
  }
}

export { docker };
