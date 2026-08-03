/** Default MySQL database quota for new non-admin users. */
export const DEFAULT_MAX_DATABASES = 3;

/** @deprecated Use DEFAULT_MAX_DATABASES / per-user maxDatabases */
export const MAX_DATABASES_PER_SERVER = DEFAULT_MAX_DATABASES;

/** @deprecated Use DEFAULT_MAX_DATABASES */
export const MAX_DATABASES_PER_OWNER = DEFAULT_MAX_DATABASES;

/** Stable server DB-user prefix, e.g. `s40903_`. */
export function databaseNamePrefix(serverId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < serverId.length; i++) {
    hash ^= serverId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = 10000 + (Math.abs(hash) % 90000);
  return `s${num}_`;
}

export interface ServerDatabase {
  id: string;
  serverId: string;
  nodeId: string;
  name: string;
  username: string;
  password: string;
  host: string;
  port: number;
  remote: string;
  jdbcUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerDatabasesResponse {
  databases: ServerDatabase[];
  /** Fixed name prefix for this server (`s12345_`). */
  prefix: string;
  /** Owner quota limit; null = unlimited. */
  limit: number | null;
  used: number;
  /** null when unlimited. */
  remaining: number | null;
  /** @deprecated alias of used */
  ownerUsed: number;
  /** @deprecated */
  ownerRemaining: number;
}
