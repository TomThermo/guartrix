import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { ServerStats } from "@msm/shared";
import { config } from "../config.js";

export interface StatsHistorySample {
  at: number;
  cpuPercent: number;
  memoryMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

const HISTORY_MS = 60 * 60 * 1000;
const MAX_SAMPLES = 3600; // ~1 Hz for 1h
const PERSIST_DEBOUNCE_MS = 12_000;
const HISTORY_DIR = () => path.join(config.dataDir, "stats-history");

const rings = new Map<string, StatsHistorySample[]>();
const lastAt = new Map<string, number>();
const dirty = new Set<string>();

let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let exitHandlersInstalled = false;

function writeServerFileSync(serverId: string, samples: StatsHistorySample[]): void {
  const dir = HISTORY_DIR();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore
  }
  const dest = fileFor(serverId);
  if (samples.length === 0) {
    try {
      fs.rmSync(dest, { force: true });
    } catch {
      // ignore
    }
    return;
  }
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(samples), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, dest);
  try {
    fs.chmodSync(dest, 0o600);
  } catch {
    // ignore
  }
}

/** Best-effort sync flush for signal handlers (before process.exit). */
export function flushStatsHistorySync(): void {
  ensureLoaded();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const samples = prune(rings.get(id) ?? []);
    if (samples.length === 0) {
      rings.delete(id);
    } else {
      rings.set(id, samples);
    }
    try {
      writeServerFileSync(id, samples);
    } catch {
      // ignore
    }
  }
}

function safeKey(serverId: string): string {
  return serverId.replace(/[^a-zA-Z0-9_\-.:@]/g, "_");
}

function fileFor(serverId: string): string {
  return path.join(HISTORY_DIR(), `${safeKey(serverId)}.json`);
}

function prune(samples: StatsHistorySample[]): StatsHistorySample[] {
  const cutoff = Date.now() - HISTORY_MS;
  const pruned = samples.filter((s) => s.at >= cutoff);
  if (pruned.length > MAX_SAMPLES) {
    return pruned.slice(pruned.length - MAX_SAMPLES);
  }
  return pruned;
}

function isSample(v: unknown): v is StatsHistorySample {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.at === "number" &&
    typeof s.cpuPercent === "number" &&
    typeof s.memoryMb === "number" &&
    typeof s.networkRxBytes === "number" &&
    typeof s.networkTxBytes === "number"
  );
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const dir = HISTORY_DIR();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore
  }
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    installExitHandlers();
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(dir, name);
    try {
      const raw = fs.readFileSync(full, "utf8");
      if (!raw.trim()) {
        fs.rmSync(full, { force: true });
        continue;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        fs.rmSync(full, { force: true });
        continue;
      }
      const samples = prune(parsed.filter(isSample));
      if (samples.length === 0) {
        fs.rmSync(full, { force: true });
        continue;
      }
      const key = name.slice(0, -".json".length);
      rings.set(key, samples);
      lastAt.set(key, samples[samples.length - 1]?.at ?? now);
    } catch {
      try {
        fs.rmSync(full, { force: true });
      } catch {
        // ignore
      }
    }
  }
  installExitHandlers();
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushStatsHistory();
  }, PERSIST_DEBOUNCE_MS);
  persistTimer.unref?.();
}

async function writeServerFile(serverId: string, samples: StatsHistorySample[]): Promise<void> {
  const dir = HISTORY_DIR();
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => undefined);
  await fsp.chmod(dir, 0o700).catch(() => undefined);
  const dest = fileFor(serverId);
  if (samples.length === 0) {
    await fsp.rm(dest, { force: true }).catch(() => undefined);
    return;
  }
  const tmp = `${dest}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(samples), { encoding: "utf8", mode: 0o600 });
  await fsp.rename(tmp, dest);
  await fsp.chmod(dest, 0o600).catch(() => undefined);
}

/** Flush dirty rings to `data/stats-history/*.json` (awaitable for shutdown). */
export async function flushStatsHistory(): Promise<void> {
  ensureLoaded();
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const ids = [...dirty];
  dirty.clear();
  if (ids.length === 0) return;

  writeChain = writeChain.catch(() => undefined).then(async () => {
    for (const id of ids) {
      const samples = prune(rings.get(id) ?? []);
      if (samples.length === 0) {
        rings.delete(id);
      } else {
        rings.set(id, samples);
      }
      await writeServerFile(id, samples);
    }
  });
  await writeChain;
}

function installExitHandlers(): void {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  const onSignal = () => {
    flushStatsHistorySync();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("beforeExit", () => {
    flushStatsHistorySync();
  });
}

/** Record a live stats sample (rate-limited ~1 Hz). Persisted under data/stats-history/. */
export function pushStatsHistory(serverId: string, stats: ServerStats): void {
  ensureLoaded();
  const now = Date.now();
  const key = safeKey(serverId);
  const prev = lastAt.get(key) ?? 0;
  if (now - prev < 900) return;
  lastAt.set(key, now);

  const sample: StatsHistorySample = {
    at: now,
    cpuPercent: stats.running ? stats.cpuPercent : 0,
    memoryMb: stats.running
      ? Math.round(stats.memoryUsedBytes / (1024 * 1024))
      : 0,
    networkRxBytes: stats.networkRxBytes ?? 0,
    networkTxBytes: stats.networkTxBytes ?? 0,
  };
  const next = prune([...(rings.get(key) ?? []), sample]);
  rings.set(key, next);
  dirty.add(key);
  schedulePersist();
}

export function getStatsHistory(serverId: string): StatsHistorySample[] {
  ensureLoaded();
  const key = safeKey(serverId);
  const pruned = prune(rings.get(key) ?? []);
  if (pruned.length !== (rings.get(key)?.length ?? 0)) {
    rings.set(key, pruned);
    dirty.add(key);
    schedulePersist();
  }
  return pruned;
}
