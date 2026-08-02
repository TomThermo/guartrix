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

/**
 * Disk-backed session store so logins survive API restarts (unlike MemoryStore).
 */
export class FileSessionStore extends EventEmitter implements SessionStore {
  private dir: string;
  private ready: Promise<void>;
  /** Serialize writes per session id to avoid rename races. */
  private writeChains = new Map<string, Promise<void>>();

  constructor(dir: string) {
    super();
    this.dir = dir;
    this.ready = fsp
      .mkdir(dir, { recursive: true, mode: 0o700 })
      .then(async () => {
        await fsp.chmod(dir, 0o700).catch(() => undefined);
      });
  }

  private fileFor(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_\-]/g, "_");
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

// Keep sync mkdir for constructors that need the dir immediately
export function ensureSessionDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // ignore
  }
}

let activeSessionStore: FileSessionStore | null = null;

export function setActiveSessionStore(store: FileSessionStore): void {
  activeSessionStore = store;
}

export async function destroySessionsForUser(userId: string): Promise<void> {
  if (!activeSessionStore) return;
  await activeSessionStore.destroySessionsForUser(userId);
}
