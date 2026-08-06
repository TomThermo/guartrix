/**
 * Shared Redis client for multi-API panel HA.
 * Opt-in via REDIS_URL (and typically SESSION_STORE / RATE_LIMIT_STORE=redis).
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export type RedisStatus = {
  configured: boolean;
  enabled: boolean;
  connected: boolean;
  urlMasked: string | null;
  latencyMs: number | null;
  error: string | null;
  sessionStore: string;
  rateLimitStore: string;
  instanceId: string;
};

type RedisClient = {
  status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<string>;
  duplicate(): RedisClient;
  publish(channel: string, message: string): Promise<number>;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  zadd(key: string, ...args: unknown[]): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zcard(key: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  scanStream(opts: {
    match: string;
    count: number;
  }): AsyncIterable<string[]> | NodeJS.ReadableStream;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  disconnect(): void;
};

const INSTANCE_ID = randomUUID();
const EVENTS_CHANNEL = "guartrix:events";
const SCHEDULER_LOCK_KEY = "guartrix:scheduler:lock";
const BRIDGE_LOCK_KEY = "guartrix:bridge:lock";
const TRANSFER_KEY_PREFIX = "guartrix:transfer:";
const RATE_LIMIT_KEY_PREFIX = "guartrix:rl:";

let client: RedisClient | null = null;
let initPromise: Promise<RedisClient | null> | null = null;
let lastError: string | null = null;
let subscriber: RedisClient | null = null;
const bus = new EventEmitter();
bus.setMaxListeners(50);

function maskRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:***@");
  }
}

export function redisInstanceId(): string {
  return INSTANCE_ID;
}

export function redisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url || null;
}

export function isRedisConfigured(): boolean {
  return Boolean(redisUrl());
}

/** True when REDIS_URL is set (product “Redis enabled”). */
export function isRedisEnabled(): boolean {
  const flag = (process.env.REDIS_ENABLED ?? "").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return isRedisConfigured();
}

export function transferRedisKey(serverId: string): string {
  return `${TRANSFER_KEY_PREFIX}${serverId}`;
}

export function rateLimitRedisKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_\-.:@]/g, "_");
  return `${RATE_LIMIT_KEY_PREFIX}${safe}`;
}

export function eventsChannel(): string {
  return EVENTS_CHANNEL;
}

export async function getRedis(): Promise<RedisClient | null> {
  if (!isRedisEnabled()) return null;
  const url = redisUrl();
  if (!url) return null;
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { default: Redis } = await import("ioredis");
      const redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
      }) as unknown as RedisClient;
      redis.on("error", (...args: unknown[]) => {
        const err = args[0];
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[guartrix] Redis error: ${lastError}`);
      });
      redis.on("connect", () => {
        lastError = null;
      });
      client = redis;
      console.info("[guartrix] Redis client connected");
      return client;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[guartrix] Redis unavailable (${lastError}) — falling back to local stores`,
      );
      client = null;
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/** Prefer existing client; for session store construction after init. */
export function getRedisSync(): RedisClient | null {
  return client;
}

export async function closeRedis(): Promise<void> {
  if (subscriber) {
    try {
      await subscriber.unsubscribe(EVENTS_CHANNEL);
      subscriber.disconnect();
    } catch {
      // ignore
    }
    subscriber = null;
  }
  if (client) {
    try {
      await client.quit();
    } catch {
      try {
        client.disconnect();
      } catch {
        // ignore
      }
    }
    client = null;
  }
}

export async function pingRedis(): Promise<{
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}> {
  const redis = await getRedis();
  if (!redis) {
    return {
      ok: false,
      latencyMs: null,
      error: lastError ?? (isRedisConfigured() ? "not connected" : "not configured"),
    };
  }
  const t0 = Date.now();
  try {
    await redis.ping();
    lastError = null;
    return { ok: true, latencyMs: Date.now() - t0, error: null };
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: null, error: lastError };
  }
}

export async function getRedisStatus(): Promise<RedisStatus> {
  const url = redisUrl();
  const sessionStore = (process.env.SESSION_STORE || "file").trim().toLowerCase();
  const rateLimitStore = (process.env.RATE_LIMIT_STORE || "file")
    .trim()
    .toLowerCase();
  const ping = await pingRedis();
  return {
    configured: Boolean(url),
    enabled: isRedisEnabled(),
    connected: ping.ok,
    urlMasked: url ? maskRedisUrl(url) : null,
    latencyMs: ping.latencyMs,
    error: ping.error,
    sessionStore,
    rateLimitStore,
    instanceId: INSTANCE_ID,
  };
}

export function schedulerLockTtlMs(): number {
  const n = Number(process.env.SCHEDULER_LOCK_TTL_MS ?? 15_000);
  return Number.isFinite(n) && n >= 3000 ? Math.floor(n) : 15_000;
}

export function bridgeLockTtlMs(): number {
  const n = Number(process.env.DAEMON_BRIDGE_LOCK_TTL_MS ?? 15_000);
  return Number.isFinite(n) && n >= 3000 ? Math.floor(n) : 15_000;
}

/**
 * Try to hold / renew the scheduler lock. Returns true if this instance is leader.
 * Without Redis, always true (single-API mode).
 */
export async function acquireSchedulerLock(): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true;
  const ttl = schedulerLockTtlMs();
  try {
    const current = await redis.get(SCHEDULER_LOCK_KEY);
    if (current === INSTANCE_ID) {
      await redis.pexpire(SCHEDULER_LOCK_KEY, ttl);
      return true;
    }
    const result = await redis.set(
      SCHEDULER_LOCK_KEY,
      INSTANCE_ID,
      "PX",
      ttl,
      "NX",
    );
    return result === "OK";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    // Fail open so a single API keeps ticking if Redis blips.
    return true;
  }
}

/**
 * Who owns daemon `/events` bridges across API replicas.
 * Without Redis: always true (single-API bridges everything).
 * With Redis: SET NX leader — **fail-closed** on errors so replicas do not
 * all reconnect and duplicate console/stats fan-out.
 */
export async function acquireBridgeLock(): Promise<boolean> {
  if (!isRedisEnabled()) return true;
  const redis = await getRedis();
  if (!redis) return false;
  const ttl = bridgeLockTtlMs();
  try {
    const current = await redis.get(BRIDGE_LOCK_KEY);
    if (current === INSTANCE_ID) {
      await redis.pexpire(BRIDGE_LOCK_KEY, ttl);
      return true;
    }
    const result = await redis.set(
      BRIDGE_LOCK_KEY,
      INSTANCE_ID,
      "PX",
      ttl,
      "NX",
    );
    return result === "OK";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

export type PanelBusPayload =
  | {
      kind: "status";
      serverId: string;
      status: string;
      errorMessage?: string | null;
    }
  | {
      kind: "players";
      serverId: string;
      players: string[];
    }
  | {
      kind: "output";
      serverId: string;
      line: string;
      stream: "stdout" | "stderr";
    }
  | {
      kind: "stats";
      serverId: string;
      stats: unknown;
    };

export type PanelBusEvent = PanelBusPayload & { origin: string };

export async function publishPanelEvent(
  event: PanelBusPayload,
): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  const payload: PanelBusEvent = { ...event, origin: INSTANCE_ID };
  try {
    await redis.publish(EVENTS_CHANNEL, JSON.stringify(payload));
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

export function onPanelBusEvent(
  listener: (event: PanelBusEvent) => void,
): () => void {
  bus.on("event", listener);
  return () => {
    bus.off("event", listener);
  };
}

/** Start subscriber for cross-replica console / status fan-out. */
export async function startPanelEventBus(): Promise<void> {
  const redis = await getRedis();
  if (!redis || subscriber) return;
  try {
    const sub = redis.duplicate();
    subscriber = sub;
    sub.on("message", (...args: unknown[]) => {
      const channel = String(args[0] ?? "");
      const message = String(args[1] ?? "");
      if (channel !== EVENTS_CHANNEL) return;
      try {
        const parsed = JSON.parse(message) as PanelBusEvent;
        if (!parsed || parsed.origin === INSTANCE_ID) return;
        bus.emit("event", parsed);
      } catch {
        // ignore
      }
    });
    await sub.subscribe(EVENTS_CHANNEL);
    console.info("[guartrix] Redis event bus subscribed");
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[guartrix] Redis event bus failed: ${lastError}`);
    subscriber = null;
  }
}

export async function scanRedisKeys(match: string): Promise<string[]> {
  const redis = await getRedis();
  if (!redis) return [];
  const keys: string[] = [];
  const stream = redis.scanStream({ match, count: 100 });
  if (Symbol.asyncIterator in Object(stream)) {
    for await (const batch of stream as AsyncIterable<string[]>) {
      keys.push(...batch);
    }
  } else {
    await new Promise<void>((resolve, reject) => {
      const readable = stream as NodeJS.ReadableStream;
      readable.on("data", (batch: string[]) => {
        keys.push(...batch);
      });
      readable.on("end", () => resolve());
      readable.on("error", reject);
    });
  }
  return keys;
}

export { TRANSFER_KEY_PREFIX, RATE_LIMIT_KEY_PREFIX, SCHEDULER_LOCK_KEY };
