/**
 * Ambient types so `import("ioredis")` typechecks when the optionalDependency
 * is not installed (SESSION_STORE=file default).
 */
declare module "ioredis" {
  import type { EventEmitter } from "node:events";

  interface RedisOptions {
    maxRetriesPerRequest?: number | null;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
    connectTimeout?: number;
    retryStrategy?: (times: number) => number | void | null;
  }

  class Redis extends EventEmitter {
    constructor(url: string, options?: RedisOptions);
    status: string;
    connect(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    pexpire(key: string, ms: number): Promise<number>;
    ping(): Promise<string>;
    quit(): Promise<string>;
    disconnect(): void;
    duplicate(): Redis;
    publish(channel: string, message: string): Promise<number>;
    subscribe(...channels: string[]): Promise<unknown>;
    unsubscribe(...channels: string[]): Promise<unknown>;
    zadd(key: string, ...args: unknown[]): Promise<number>;
    zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
    zcard(key: string): Promise<number>;
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    scanStream(opts: { match: string; count: number }): NodeJS.ReadableStream;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export default Redis;
}
