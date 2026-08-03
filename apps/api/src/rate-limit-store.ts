import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export type RateLimitHitResult = { limited: boolean; remaining: number };

interface BucketState {
  hits: number[];
  windowMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, max: number): RateLimitHitResult;
  clear(key: string): void;
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_\-.:@]/g, "_");
}

function pruneHits(hits: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return hits.filter((t) => t > cutoff);
}

function applyHit(
  state: BucketState | undefined,
  windowMs: number,
  max: number,
  now: number,
): { next: BucketState; result: RateLimitHitResult } {
  const prevHits = state ? pruneHits(state.hits, windowMs, now) : [];
  if (prevHits.length >= max) {
    return {
      next: { hits: prevHits, windowMs },
      result: { limited: true, remaining: 0 },
    };
  }
  const hits = [...prevHits, now];
  return {
    next: { hits, windowMs },
    result: { limited: false, remaining: Math.max(0, max - hits.length) },
  };
}

/** In-memory only (lost on API restart). */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, BucketState>();

  hit(key: string, windowMs: number, max: number): RateLimitHitResult {
    const now = Date.now();
    const { next, result } = applyHit(this.buckets.get(key), windowMs, max, now);
    this.buckets.set(key, next);
    return result;
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }
}

/**
 * Disk-backed rate limits under `data/rate-limits/` so counters survive API restarts.
 * In-memory Map is the source of truth; writes are write-through (tmp + rename, 0o600).
 */
export class FileRateLimitStore implements RateLimitStore {
  private dir: string;
  private cache = new Map<string, BucketState>();
  private writeChains = new Map<string, Promise<void>>();
  private ready: Promise<void>;

  constructor(dir: string) {
    this.dir = dir;
    this.ready = fsp
      .mkdir(dir, { recursive: true, mode: 0o700 })
      .then(async () => {
        await fsp.chmod(dir, 0o700).catch(() => undefined);
        await this.hydrateFromDisk();
      });
  }

  private fileFor(key: string): string {
    return path.join(this.dir, `${safeKey(key)}.json`);
  }

  private async hydrateFromDisk(): Promise<void> {
    let names: string[];
    try {
      names = await fsp.readdir(this.dir);
    } catch {
      return;
    }
    const now = Date.now();
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const full = path.join(this.dir, name);
      try {
        const raw = await fsp.readFile(full, "utf8");
        if (!raw.trim()) {
          await fsp.rm(full, { force: true }).catch(() => undefined);
          continue;
        }
        const parsed = JSON.parse(raw) as BucketState;
        if (!Array.isArray(parsed.hits) || typeof parsed.windowMs !== "number") {
          await fsp.rm(full, { force: true }).catch(() => undefined);
          continue;
        }
        const hits = pruneHits(parsed.hits, parsed.windowMs, now);
        if (hits.length === 0) {
          await fsp.rm(full, { force: true }).catch(() => undefined);
          continue;
        }
        const key = name.slice(0, -".json".length);
        this.cache.set(key, { hits, windowMs: parsed.windowMs });
      } catch {
        await fsp.rm(full, { force: true }).catch(() => undefined);
      }
    }
  }

  private scheduleWrite(key: string, state: BucketState): void {
    const prev = this.writeChains.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await this.ready;
        const dest = this.fileFor(key);
        const tmp = `${dest}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(state), {
          encoding: "utf8",
          mode: 0o600,
        });
        await fsp.rename(tmp, dest);
        await fsp.chmod(dest, 0o600).catch(() => undefined);
      });
    this.writeChains.set(key, next);
    void next.finally(() => {
      if (this.writeChains.get(key) === next) {
        this.writeChains.delete(key);
      }
    });
  }

  private scheduleDelete(key: string): void {
    const prev = this.writeChains.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await this.ready;
        await fsp.rm(this.fileFor(key), { force: true }).catch(() => undefined);
      });
    this.writeChains.set(key, next);
    void next.finally(() => {
      if (this.writeChains.get(key) === next) {
        this.writeChains.delete(key);
      }
    });
  }

  hit(key: string, windowMs: number, max: number): RateLimitHitResult {
    const now = Date.now();
    const cacheKey = safeKey(key);
    const { next, result } = applyHit(this.cache.get(cacheKey), windowMs, max, now);
    this.cache.set(cacheKey, next);
    this.scheduleWrite(cacheKey, next);
    return result;
  }

  clear(key: string): void {
    const cacheKey = safeKey(key);
    this.cache.delete(cacheKey);
    this.scheduleDelete(cacheKey);
  }
}

export function ensureRateLimitDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore
  }
}

let activeStore: RateLimitStore | null = null;

export function rateLimitStoreMode(): "memory" | "file" {
  const raw = (process.env.RATE_LIMIT_STORE ?? "file").trim().toLowerCase();
  return raw === "memory" ? "memory" : "file";
}

export function createRateLimitStore(dataDir = config.dataDir): RateLimitStore {
  if (rateLimitStoreMode() === "memory") {
    return new MemoryRateLimitStore();
  }
  const dir = path.join(dataDir, "rate-limits");
  ensureRateLimitDir(dir);
  return new FileRateLimitStore(dir);
}

export function setActiveRateLimitStore(store: RateLimitStore): void {
  activeStore = store;
}

export function getRateLimitStore(): RateLimitStore {
  if (!activeStore) {
    activeStore = createRateLimitStore();
  }
  return activeStore;
}
