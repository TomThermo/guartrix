import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { docker, isNamedContainerRunning } from "./docker.js";
import { closeFirewallPort } from "./firewall.js";
import {
  GUARTRIX_NETWORK,
  MYSQL_CONTAINER,
  ensureGuartrixNetwork,
  mysqlRootPassword,
  waitForMysqlReady,
} from "./mysql-network.js";

export const MYSQL_IMAGE = process.env.MYSQL_IMAGE ?? "mysql:8.4";

function mysqlDataDir(): string {
  return path.join(config.dataDir, "mysql");
}

export function mysqlPort(): number {
  const n = Number(process.env.MYSQL_PORT ?? 3306);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 3306;
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
