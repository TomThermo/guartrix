import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { Session } from "fastify";
import type { SessionStore } from "@fastify/session";

interface StoredSession {
  data: Session;
  expires: number | null;
}

type StoreCallback = (err?: Error) => void;
type StoreGetCallback = (err: Error | null, session: Session | null | undefined) => void;

/** Session store that can revoke all sessions for a user id. */
export interface PanelSessionStore extends SessionStore {
  destroySessionsForUser(userId: string): Promise<number>;
  purgeExpired?(): Promise<void>;
}

/**
 * Disk-backed session store so logins survive API restarts (unlike MemoryStore).
 */
export class FileSessionStore extends EventEmitter implements PanelSessionStore {
  private dir: string;
  private ready: Promise<void>;
  /** Serialize writes per session id to avoid rename races. */
  private writeChains = new Map<string, Promise<void>>();

  constructor(dir: string) {
    super();
    this.dir = dir;
    this.ready = fsp.mkdir(dir, { recursive: true, mode: 0o700 }).then(async () => {
      await fsp.chmod(dir, 0o700).catch(() => undefined);
    });
  }

  private fileFor(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dir, `${safe}.json`);
  }

  set(sessionId: string, session: Session, callback: StoreCallback): void {
    const prev = this.writeChains.get(sessionId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await this.ready;
        const cookie = session.cookie as
          | { maxAge?: number; expires?: Date | string | boolean }
          | undefined;
        let expires: number | null = null;
        if (cookie?.expires instanceof Date) {
          expires = cookie.expires.getTime();
        } else if (typeof cookie?.expires === "string") {
          expires = new Date(cookie.expires).getTime();
        } else if (typeof cookie?.maxAge === "number" && cookie.maxAge > 0) {
          expires = Date.now() + cookie.maxAge;
        }

        const payload: StoredSession = {
          data: session,
          expires,
        };
        const dest = this.fileFor(sessionId);
        const tmp = `${dest}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(payload), {
          encoding: "utf8",
          mode: 0o600,
        });
        await fsp.rename(tmp, dest);
        await fsp.chmod(dest, 0o600).catch(() => undefined);
      });
    this.writeChains.set(sessionId, next);
    void next
      .then(() => callback())
      .catch((err: Error) => callback(err))
      .finally(() => {
        if (this.writeChains.get(sessionId) === next) {
          this.writeChains.delete(sessionId);
        }
      });
  }

  get(sessionId: string, callback: StoreGetCallback): void {
    void this.ready
      .then(async () => {
        const file = this.fileFor(sessionId);
        try {
          const raw = await fsp.readFile(file, "utf8");
          if (!raw.trim()) {
            await fsp.rm(file, { force: true }).catch(() => undefined);
            callback(null, null);
            return;
          }
          let stored: StoredSession;
          try {
            stored = JSON.parse(raw) as StoredSession;
          } catch {
            await fsp.rm(file, { force: true }).catch(() => undefined);
            callback(null, null);
            return;
          }
          if (stored.expires != null && stored.expires <= Date.now()) {
            await fsp.rm(file, { force: true }).catch(() => undefined);
            callback(null, null);
            return;
          }
          callback(null, stored.data ?? null);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            callback(null, null);
            return;
          }
          callback(err as Error, undefined);
        }
      })
      .catch((err: Error) => callback(err, undefined));
  }

  destroy(sessionId: string, callback: StoreCallback): void {
    void fsp
      .rm(this.fileFor(sessionId), { force: true })
      .then(() => callback())
      .catch((err: Error) => callback(err));
  }

  /** Best-effort cleanup of expired / corrupt session files. */
  async purgeExpired(): Promise<void> {
    await this.ready;
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
          await fsp.rm(full, { force: true });
          continue;
        }
        const stored = JSON.parse(raw) as StoredSession;
        if (stored.expires != null && stored.expires <= now) {
          await fsp.rm(full, { force: true });
        }
      } catch {
        await fsp.rm(full, { force: true }).catch(() => undefined);
      }
    }
  }

  /** Destroy all sessions belonging to a user (e.g. after password reset). */
  async destroySessionsForUser(userId: string): Promise<number> {
    await this.ready;
    let names: string[];
    try {
      names = await fsp.readdir(this.dir);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const full = path.join(this.dir, name);
      try {
        const raw = await fsp.readFile(full, "utf8");
        const stored = JSON.parse(raw) as StoredSession;
        const data = stored.data as { userId?: string };
        if (data?.userId === userId) {
          await fsp.rm(full, { force: true });
          removed += 1;
        }
      } catch {
        // ignore
      }
    }
    return removed;
  }
}

/**
 * Redis-backed sessions for multi-API HA (`SESSION_STORE=redis` + `REDIS_URL`).
 * Requires optional dependency `ioredis` (`npm i ioredis` in apps/api).
 */
export class RedisSessionStore extends EventEmitter implements PanelSessionStore {
  private redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    scanStream(opts: {
      match: string;
      count: number;
    }): AsyncIterable<string[]> | NodeJS.ReadableStream;
    quit(): Promise<string>;
  };
  private prefix: string;

  constructor(redis: RedisSessionStore["redis"], prefix = "guartrix:session:") {
    super();
    this.redis = redis;
    this.prefix = prefix;
  }

  private key(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${this.prefix}${safe}`;
  }

  private ttlSeconds(session: Session): number | null {
    const cookie = session.cookie as
      | { maxAge?: number; expires?: Date | string | boolean }
      | undefined;
    if (cookie?.expires instanceof Date) {
      return Math.max(1, Math.ceil((cookie.expires.getTime() - Date.now()) / 1000));
    }
    if (typeof cookie?.expires === "string") {
      const ms = new Date(cookie.expires).getTime() - Date.now();
      return Math.max(1, Math.ceil(ms / 1000));
    }
    if (typeof cookie?.maxAge === "number" && cookie.maxAge > 0) {
      return Math.max(1, Math.ceil(cookie.maxAge / 1000));
    }
    return null;
  }

  set(sessionId: string, session: Session, callback: StoreCallback): void {
    void (async () => {
      const payload: StoredSession = {
        data: session,
        expires: (() => {
          const ttl = this.ttlSeconds(session);
          return ttl != null ? Date.now() + ttl * 1000 : null;
        })(),
      };
      const key = this.key(sessionId);
      const raw = JSON.stringify(payload);
      const ttl = this.ttlSeconds(session);
      if (ttl != null) {
        await this.redis.set(key, raw, "EX", ttl);
      } else {
        await this.redis.set(key, raw);
      }
    })()
      .then(() => callback())
      .catch((err: Error) => callback(err));
  }

  get(sessionId: string, callback: StoreGetCallback): void {
    void this.redis
      .get(this.key(sessionId))
      .then((raw) => {
        if (!raw) {
          callback(null, null);
          return;
        }
        try {
          const stored = JSON.parse(raw) as StoredSession;
          if (stored.expires != null && stored.expires <= Date.now()) {
            void this.redis.del(this.key(sessionId));
            callback(null, null);
            return;
          }
          callback(null, stored.data ?? null);
        } catch {
          void this.redis.del(this.key(sessionId));
          callback(null, null);
        }
      })
      .catch((err: Error) => callback(err, undefined));
  }

  destroy(sessionId: string, callback: StoreCallback): void {
    void this.redis
      .del(this.key(sessionId))
      .then(() => callback())
      .catch((err: Error) => callback(err));
  }

  async destroySessionsForUser(userId: string): Promise<number> {
    const stream = this.redis.scanStream({
      match: `${this.prefix}*`,
      count: 100,
    });
    let removed = 0;
    const keys: string[] = [];

    // ioredis scanStream is a Node Readable; support async iteration when present.
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

    for (const key of keys) {
      try {
        const raw = await this.redis.get(key);
        if (!raw) continue;
        const stored = JSON.parse(raw) as StoredSession;
        const data = stored.data as { userId?: string };
        if (data?.userId === userId) {
          await this.redis.del(key);
          removed += 1;
        }
      } catch {
        // ignore corrupt keys
      }
    }
    return removed;
  }
}

// Keep sync mkdir for constructors that need the dir immediately
export function ensureSessionDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore
  }
}

let activeSessionStore: PanelSessionStore | null = null;

export function setActiveSessionStore(store: PanelSessionStore): void {
  activeSessionStore = store;
}

export async function destroySessionsForUser(userId: string): Promise<void> {
  if (!activeSessionStore) return;
  await activeSessionStore.destroySessionsForUser(userId);
}

/**
 * Prefer Redis when `SESSION_STORE=redis` and shared Redis client is available;
 * otherwise FileSessionStore under `data/sessions` (NFS-shareable for multi-API).
 */
export async function createSessionStore(sessionsDir: string): Promise<PanelSessionStore> {
  const mode = (process.env.SESSION_STORE || "file").trim().toLowerCase();
  if (mode === "redis") {
    const { getRedis } = await import("../redis.js");
    const redis = await getRedis();
    if (!redis) {
      console.warn("[guartrix] SESSION_STORE=redis but Redis unavailable — using file sessions");
    } else {
      console.info("[guartrix] Session store: redis");
      return new RedisSessionStore(redis);
    }
  }

  console.info("[guartrix] Session store: file");
  return new FileSessionStore(sessionsDir);
}
