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
  }

  class Redis extends EventEmitter {
    constructor(url: string, options?: RedisOptions);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    scanStream(opts: { match: string; count: number }): NodeJS.ReadableStream;
    quit(): Promise<string>;
    on(event: "error", listener: (err: Error) => void): this;
  }

  export default Redis;
}
