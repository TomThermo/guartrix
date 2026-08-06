import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { docker, isNamedContainerRunning } from "./docker.js";
import { closeFirewallPort } from "./firewall.js";

export const MYSQL_CONTAINER = "guartrix-mysql";
export const MYSQL_IMAGE = process.env.MYSQL_IMAGE ?? "mysql:8.4";
export const GUARTRIX_NETWORK = "guartrix";

function mysqlDataDir(): string {
  return path.join(config.dataDir, "mysql");
}

function mysqlPort(): number {
  const n = Number(process.env.MYSQL_PORT ?? 3306);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 3306;
}

function mysqlRootPassword(): string {
  const existing = process.env.MYSQL_ROOT_PASSWORD?.trim();
  if (existing) return existing;
  throw new Error(
    "MYSQL_ROOT_PASSWORD is not set — restart the panel/daemon to bootstrap it",
  );
}

/**
 * Hostname plugins use from game containers (Docker network DNS).
 * Override with MYSQL_PUBLIC_HOST only if needed.
 */
export function mysqlPublicHost(): string {
  return process.env.MYSQL_PUBLIC_HOST?.trim() || MYSQL_CONTAINER;
}

export interface MysqlStatus {
  running: boolean;
  container: string;
  image: string;
  host: string;
  port: number;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function assertIdent(value: string, label: string): string {
  if (!/^[a-zA-Z0-9_]{2,64}$/.test(value)) {
    throw new Error(
      `Invalid MySQL ${label}: use 2–64 letters, digits or underscore`,
    );
  }
  return value;
}

async function mysqlExecSql(sql: string): Promise<string> {
  const { stdout, stderr } = await docker(
    [
      "exec",
      MYSQL_CONTAINER,
      "mysql",
      "-uroot",
      `-p${mysqlRootPassword()}`,
      "-N",
      "-e",
      sql,
    ],
    { timeout: 30_000 },
  );
  const out = `${stdout || ""}${stderr || ""}`
    .split(/\r?\n/)
    .filter((line) => line && !line.includes("Using a password on the command line"))
    .join("\n")
    .trim();
  return out;
}

async function waitForMysqlReady(timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  let lastError = "timeout";
  while (Date.now() - started < timeoutMs) {
    try {
      await docker(
        [
          "exec",
          MYSQL_CONTAINER,
          "mysqladmin",
          "ping",
          "-h",
          "127.0.0.1",
          "-uroot",
          `-p${mysqlRootPassword()}`,
          "--silent",
        ],
        { timeout: 10_000 },
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`MySQL container did not become ready: ${lastError}`);
}

export async function getMysqlStatus(): Promise<MysqlStatus> {
  const running = await isNamedContainerRunning(MYSQL_CONTAINER).catch(() => false);
  return {
    running,
    container: MYSQL_CONTAINER,
    image: MYSQL_IMAGE,
    host: mysqlPublicHost(),
    port: mysqlPort(),
  };
}

export async function ensureGuartrixNetwork(): Promise<void> {
  try {
    await docker(["network", "inspect", GUARTRIX_NETWORK], { timeout: 10_000 });
  } catch {
    await docker(["network", "create", GUARTRIX_NETWORK], { timeout: 15_000 });
  }
}

/** `shared` = flat `guartrix` bridge; `per_server` = isolated game network + shared DB attach. */
export function dockerNetworkMode(): "shared" | "per_server" {
  const raw = (process.env.DOCKER_NETWORK_MODE ?? "per_server").trim().toLowerCase();
  if (raw === "shared") {
    if (process.env.ALLOW_SHARED_DOCKER_NETWORK !== "1") {
      console.warn(
        "[guartrix] DOCKER_NETWORK_MODE=shared ignored — set ALLOW_SHARED_DOCKER_NETWORK=1 to enable flat bridge",
      );
      return "per_server";
    }
    return "shared";
  }
  return "per_server";
}

/** Docker network name for a game server when DOCKER_NETWORK_MODE=per_server. */
export function serverNetworkName(serverId: string): string {
  const short =
    serverId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase() || "unknown";
  return `guartrix-s-${short}`;
}

export async function ensureServerNetwork(serverId: string): Promise<string> {
  const name = serverNetworkName(serverId);
  try {
    await docker(["network", "inspect", name], { timeout: 10_000 });
  } catch {
    await docker(["network", "create", "--label", "guartrix=1", name], {
      timeout: 15_000,
    });
  }
  return name;
}

/**
 * Resolve the primary Docker network for a game container.
 * Always ensures the shared `guartrix` bridge exists (MySQL lives there).
 */
export async function resolveGameNetwork(serverId: string): Promise<{
  primary: string;
  attachSharedDb: boolean;
}> {
  await ensureGuartrixNetwork();
  if (dockerNetworkMode() === "per_server") {
    const primary = await ensureServerNetwork(serverId);
    return { primary, attachSharedDb: true };
  }
  return { primary: GUARTRIX_NETWORK, attachSharedDb: false };
}

/** Attach a running container to the shared MySQL bridge (idempotent). */
export async function connectContainerToSharedNetwork(
  containerName: string,
): Promise<void> {
  await ensureGuartrixNetwork();
  try {
    await docker(["network", "connect", GUARTRIX_NETWORK, containerName], {
      timeout: 15_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already attached
    if (/already (exists|connected)|endpoint with name/i.test(msg)) return;
    throw err;
  }
}

async function mysqlNeedsRecreate(): Promise<boolean> {
  try {
    const { stdout } = await docker(
      [
        "inspect",
        MYSQL_CONTAINER,
        "--format",
        "{{json .HostConfig.PortBindings}}|{{json .NetworkSettings.Networks}}",
      ],
      { timeout: 10_000 },
    );
    const [bindingsRaw, networksRaw] = stdout.trim().split("|");
    const bindings = bindingsRaw ? JSON.parse(bindingsRaw) : {};
    const networks = networksRaw ? JSON.parse(networksRaw) : {};
    const binds = bindings?.["3306/tcp"] as { HostIp?: string }[] | undefined;
    const hostIp = binds?.[0]?.HostIp ?? "";
    if (hostIp !== "127.0.0.1" && hostIp !== "::1") return true;
    if (!networks?.[GUARTRIX_NETWORK]) return true;
    return false;
  } catch {
    return true;
  }
}

/** Ensure MySQL is running: Docker network only + loopback publish (not public). */
export async function ensureMysql(): Promise<MysqlStatus> {
  await fsp.mkdir(mysqlDataDir(), { recursive: true, mode: 0o700 });
  const rootPassword = mysqlRootPassword();
  const port = mysqlPort();
  await ensureGuartrixNetwork();
  await closeFirewallPort(port).catch(() => undefined);

  let running = await isNamedContainerRunning(MYSQL_CONTAINER).catch(() => false);
  if (running && (await mysqlNeedsRecreate())) {
    await docker(["rm", "-f", MYSQL_CONTAINER], { timeout: 60_000 }).catch(() => undefined);
    running = false;
  }

  if (running) {
    await waitForMysqlReady(30_000);
    return getMysqlStatus();
  }

  try {
    await docker(["rm", "-f", MYSQL_CONTAINER], { timeout: 30_000 });
  } catch {
    // ignore
  }

  try {
    await docker(["pull", MYSQL_IMAGE], { timeout: 300_000 });
  } catch {
    // may already be local
  }

  await docker(
    [
      "run",
      "-d",
      "--name",
      MYSQL_CONTAINER,
      "--restart",
      "unless-stopped",
      "--network",
      GUARTRIX_NETWORK,
      "--security-opt",
      "no-new-privileges:true",
      "--cap-drop",
      "ALL",
      "--cap-add",
      "CHOWN",
      "--cap-add",
      "DAC_OVERRIDE",
      "--cap-add",
      "FOWNER",
      "--cap-add",
      "SETGID",
      "--cap-add",
      "SETUID",
      "--pids-limit",
      "256",
      "--label",
      "guartrix=1",
      "--label",
      "guartrix.mysql=1",
      "-e",
      `MYSQL_ROOT_PASSWORD=${rootPassword}`,
      "-p",
      `127.0.0.1:${port}:3306`,
      "-v",
      `${mysqlDataDir()}:/var/lib/mysql`,
      MYSQL_IMAGE,
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_unicode_ci",
      "--bind-address=0.0.0.0",
    ],
    { timeout: 60_000 },
  );

  await waitForMysqlReady();
  await closeFirewallPort(port).catch(() => undefined);
  return getMysqlStatus();
}

export interface CreateMysqlDatabaseInput {
  name: string;
  username: string;
  password: string;
  remote?: string;
}

export interface CreateMysqlDatabaseResult {
  name: string;
  username: string;
  password: string;
  host: string;
  port: number;
  remote: string;
}

export async function createMysqlDatabase(
  input: CreateMysqlDatabaseInput,
): Promise<CreateMysqlDatabaseResult> {
  await ensureMysql();
  const name = assertIdent(input.name, "database name");
  const username = assertIdent(input.username, "username");
  const password = input.password;
  if (!password || password.length < 8) {
    throw new Error("MySQL password must be at least 8 characters");
  }
  // Default to Docker bridge hosts only — not '%' (world). Operators can still
  // pass remote="%" explicitly if they need it.
  const remote = (input.remote ?? "172.%").trim() || "172.%";
  if (remote !== "%" && !/^[a-zA-Z0-9._%-]+$/.test(remote)) {
    throw new Error("Invalid MySQL remote host pattern");
  }

  const user = escapeSqlLiteral(username);
  const pass = escapeSqlLiteral(password);
  const host = escapeSqlLiteral(remote);

  // Drop leftover grants for this user@host if recreating
  await mysqlExecSql(
    [
      `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `CREATE USER IF NOT EXISTS '${user}'@'${host}' IDENTIFIED BY '${pass}';`,
      `ALTER USER '${user}'@'${host}' IDENTIFIED BY '${pass}';`,
      `GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${user}'@'${host}';`,
      `FLUSH PRIVILEGES;`,
    ].join(" "),
  );

  return {
    name,
    username,
    password,
    host: mysqlPublicHost(),
    port: mysqlPort(),
    remote,
  };
}

export async function deleteMysqlDatabase(input: {
  name: string;
  username: string;
  remote?: string;
}): Promise<void> {
  const status = await getMysqlStatus();
  if (!status.running) return;

  const name = assertIdent(input.name, "database name");
  const username = assertIdent(input.username, "username");
  const remote = (input.remote ?? "%").trim() || "%";
  const user = escapeSqlLiteral(username);
  const host = escapeSqlLiteral(remote);

  await mysqlExecSql(
    [
      `DROP DATABASE IF EXISTS \`${name}\`;`,
      `DROP USER IF EXISTS '${user}'@'${host}';`,
      `FLUSH PRIVILEGES;`,
    ].join(" "),
  );
}

/** Rotate MySQL user password without recreating the database. */
export async function rotateMysqlPassword(input: {
  name: string;
  username: string;
  password: string;
  remote?: string;
}): Promise<CreateMysqlDatabaseResult> {
  await ensureMysql();
  const name = assertIdent(input.name, "database name");
  const username = assertIdent(input.username, "username");
  const password = input.password;
  if (!password || password.length < 8) {
    throw new Error("MySQL password must be at least 8 characters");
  }
  const remote = (input.remote ?? "172.%").trim() || "172.%";
  if (remote !== "%" && !/^[a-zA-Z0-9._%-]+$/.test(remote)) {
    throw new Error("Invalid MySQL remote host pattern");
  }

  const user = escapeSqlLiteral(username);
  const pass = escapeSqlLiteral(password);
  const host = escapeSqlLiteral(remote);

  await mysqlExecSql(
    [
      `ALTER USER '${user}'@'${host}' IDENTIFIED BY '${pass}';`,
      `FLUSH PRIVILEGES;`,
    ].join(" "),
  );

  return {
    name,
    username,
    password,
    host: mysqlPublicHost(),
    port: mysqlPort(),
    remote,
  };
}

/** Dump a database to a host file via mysqldump inside the MySQL container. */
export async function dumpMysqlDatabaseToFile(
  name: string,
  destPath: string,
): Promise<void> {
  await ensureMysql();
  const db = assertIdent(name, "database name");
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        MYSQL_CONTAINER,
        "mysqldump",
        "-uroot",
        `-p${mysqlRootPassword()}`,
        "--single-transaction",
        "--routines",
        "--databases",
        db,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const out = fs.createWriteStream(destPath);
    child.stdout.pipe(out);
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      if (!line.includes("Using a password on the command line")) err += line;
    });
    child.on("error", reject);
    out.on("error", reject);
    child.on("close", (code) => {
      out.end();
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `mysqldump exited ${code}`));
    });
  });
}

/** Restore a SQL dump into an existing database. */
export async function restoreMysqlDatabaseFromFile(
  name: string,
  sqlPath: string,
): Promise<void> {
  await ensureMysql();
  const db = assertIdent(name, "database name");
  await fsp.access(sqlPath);
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        MYSQL_CONTAINER,
        "mysql",
        "-uroot",
        `-p${mysqlRootPassword()}`,
        db,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    const input = fs.createReadStream(sqlPath);
    input.pipe(child.stdin!);
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      if (!line.includes("Using a password on the command line")) err += line;
    });
    child.on("error", reject);
    input.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `mysql restore exited ${code}`));
    });
  });
}

export function generateMysqlPassword(bytes = 18): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Persist root password into daemon.env if missing (called from start-prod / API bootstrap). */
export function readOrCreateMysqlRootPassword(daemonEnvPath: string): string {
  let existing = process.env.MYSQL_ROOT_PASSWORD?.trim();
  if (existing) return existing;

  try {
    const raw = fs.readFileSync(daemonEnvPath, "utf8");
    const match = raw.match(/^MYSQL_ROOT_PASSWORD=(.*)$/m);
    if (match?.[1]?.trim()) {
      existing = match[1].trim();
      process.env.MYSQL_ROOT_PASSWORD = existing;
      return existing;
    }
  } catch {
    // create below
  }

  const generated = crypto.randomBytes(24).toString("hex");
  process.env.MYSQL_ROOT_PASSWORD = generated;
  return generated;
}
