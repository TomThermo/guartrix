/**
 * Docker Engine API over the unix socket (Wings-style).
 * Prefer this over spawning `docker stats` for continuous resource polling.
 */
import http from "node:http";
import { URL } from "node:url";

const DOCKER_SOCKET =
  process.env.DOCKER_SOCK?.trim() ||
  process.env.DOCKER_SOCKET?.trim() ||
  "/var/run/docker.sock";

export type DockerCpuStats = {
  cpu_usage: {
    total_usage: number;
    percpu_usage?: number[];
  };
  system_cpu_usage?: number;
  online_cpus?: number;
};

export type DockerMemoryStats = {
  usage?: number;
  limit?: number;
  stats?: Record<string, number>;
};

export type DockerStatsFrame = {
  read?: string;
  preread?: string;
  cpu_stats: DockerCpuStats;
  precpu_stats: DockerCpuStats;
  memory_stats: DockerMemoryStats;
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  blkio_stats?: {
    io_service_bytes_recursive?: Array<{ op?: string; value?: number }>;
  };
  pids_stats?: { current?: number };
};

export type EngineStats = {
  memoryBytes: number;
  memoryLimitBytes: number;
  cpuAbsolute: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
};

/** Same formula as Docker CLI / Wings (inactive_file subtracted). */
export function calculateDockerMemory(stats: DockerMemoryStats): number {
  const usage = stats.usage ?? 0;
  const map = stats.stats ?? {};
  if (
    typeof map.total_inactive_file === "number" &&
    map.total_inactive_file < usage
  ) {
    return usage - map.total_inactive_file;
  }
  if (typeof map.inactive_file === "number" && map.inactive_file < usage) {
    return usage - map.inactive_file;
  }
  return usage;
}

/**
 * Absolute CPU% across all cores (can exceed 100), matching Wings /
 * `docker stats` CPUPerc semantics before host normalisation.
 */
export function calculateDockerAbsoluteCpu(
  precpu: DockerCpuStats,
  cpu: DockerCpuStats,
): number {
  const cpuDelta =
    (cpu.cpu_usage?.total_usage ?? 0) - (precpu.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (cpu.system_cpu_usage ?? 0) - (precpu.system_cpu_usage ?? 0);
  let cpus = cpu.online_cpus ?? 0;
  if (!cpus) {
    cpus = cpu.cpu_usage?.percpu_usage?.length ?? 0;
  }
  if (systemDelta <= 0 || cpuDelta <= 0) return 0;
  let percent = (cpuDelta / systemDelta) * 100;
  if (cpus > 0) percent *= cpus;
  return Math.round(percent * 1000) / 1000;
}

function blkioBytes(
  entries: Array<{ op?: string; value?: number }> | undefined,
  op: string,
): number {
  if (!entries?.length) return 0;
  let total = 0;
  for (const e of entries) {
    if ((e.op ?? "").toLowerCase() === op.toLowerCase()) {
      total += e.value ?? 0;
    }
  }
  return total;
}

export function frameToEngineStats(frame: DockerStatsFrame): EngineStats {
  const memoryBytes = calculateDockerMemory(frame.memory_stats ?? {});
  const memoryLimitBytes = frame.memory_stats?.limit ?? 0;
  const cpuAbsolute = calculateDockerAbsoluteCpu(
    frame.precpu_stats ?? { cpu_usage: { total_usage: 0 } },
    frame.cpu_stats ?? { cpu_usage: { total_usage: 0 } },
  );
  let networkRxBytes = 0;
  let networkTxBytes = 0;
  for (const nw of Object.values(frame.networks ?? {})) {
    networkRxBytes += nw.rx_bytes ?? 0;
    networkTxBytes += nw.tx_bytes ?? 0;
  }
  const recursive = frame.blkio_stats?.io_service_bytes_recursive;
  return {
    memoryBytes,
    memoryLimitBytes,
    cpuAbsolute,
    networkRxBytes,
    networkTxBytes,
    blockReadBytes: blkioBytes(recursive, "read"),
    blockWriteBytes: blkioBytes(recursive, "write"),
    pids: frame.pids_stats?.current ?? 0,
  };
}

function dockerRequest(
  method: string,
  apiPath: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<{ statusCode: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET,
        path: apiPath,
        method,
        headers: { Host: "docker", Connection: "close" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    const timeoutMs = opts?.timeoutMs ?? 15_000;
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Docker API timeout ${method} ${apiPath}`));
    });
    const onAbort = () => {
      req.destroy(new Error("aborted"));
    };
    if (opts?.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    req.end();
  });
}

export async function dockerPing(): Promise<boolean> {
  try {
    const res = await dockerRequest("GET", "/_ping", { timeoutMs: 3_000 });
    return res.statusCode === 200 && res.body.toString() === "OK";
  } catch {
    return false;
  }
}

/** One-shot container stats (stream=false). */
export async function fetchContainerStatsOnce(
  containerNameOrId: string,
  signal?: AbortSignal,
): Promise<EngineStats | null> {
  const enc = encodeURIComponent(containerNameOrId);
  const res = await dockerRequest(
    "GET",
    `/containers/${enc}/stats?stream=0`,
    { signal, timeoutMs: 12_000 },
  );
  if (res.statusCode === 404) return null;
  if (res.statusCode !== 200) {
    throw new Error(`Docker stats HTTP ${res.statusCode}`);
  }
  const frame = JSON.parse(res.body.toString("utf8")) as DockerStatsFrame;
  // First frame often has empty precpu — ignore zero CPU
  return frameToEngineStats(frame);
}

/**
 * Stream container stats until aborted (Wings pollResources equivalent).
 * Docker emits ~1 JSON object per second.
 */
export async function streamContainerStats(
  containerNameOrId: string,
  onFrame: (stats: EngineStats, raw: DockerStatsFrame) => void,
  signal: AbortSignal,
): Promise<void> {
  const enc = encodeURIComponent(containerNameOrId);
  const apiPath = `/containers/${enc}/stats?stream=1`;

  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET,
        path: apiPath,
        method: "GET",
        headers: { Host: "docker" },
      },
      (res) => {
        if (res.statusCode === 404) {
          reject(new Error("container not found"));
          res.resume();
          return;
        }
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`Docker stats stream HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buf += chunk;
          let nl = buf.indexOf("\n");
          while (nl >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) {
              try {
                const raw = JSON.parse(line) as DockerStatsFrame;
                onFrame(frameToEngineStats(raw), raw);
              } catch {
                // incomplete / malformed — skip
              }
            }
            nl = buf.indexOf("\n");
          }
        });
        res.on("end", () => resolve());
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    const onAbort = () => {
      req.destroy();
      resolve();
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    req.end();
  });
}

export async function containerStartedAtMs(
  containerNameOrId: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const enc = encodeURIComponent(containerNameOrId);
  const res = await dockerRequest("GET", `/containers/${enc}/json`, {
    signal,
    timeoutMs: 8_000,
  });
  if (res.statusCode !== 200) return null;
  try {
    const info = JSON.parse(res.body.toString("utf8")) as {
      State?: { StartedAt?: string; Running?: boolean };
    };
    const started = info.State?.StartedAt;
    if (!started || !info.State?.Running) return null;
    const t = Date.parse(started);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/** Escape hatch for tests / DOCKER_HOST tcp (rare). */
export function dockerSocketPath(): string {
  return DOCKER_SOCKET;
}

export function dockerHostHint(): string {
  try {
    return new URL(process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock")
      .pathname;
  } catch {
    return DOCKER_SOCKET;
  }
}
