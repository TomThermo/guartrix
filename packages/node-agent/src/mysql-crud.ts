import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { docker } from "./docker.js";
import {
  MYSQL_CONTAINER,
  withMysqlDefaultsFile,
} from "./mysql-network.js";
import {
  ensureMysql,
  getMysqlStatus,
  mysqlPort,
  mysqlPublicHost,
} from "./mysql-container.js";

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

/**
 * Game DB users may only grant from private Docker/LAN patterns.
 * World (`%`) is rejected on create/rotate. Delete may pass `%` to clean legacy grants.
 */
export function assertSafeMysqlRemote(
  remote: string | undefined,
  opts?: { allowWorld?: boolean; fallback?: string },
): string {
  const fallback = opts?.fallback ?? "172.%";
  const value = (remote ?? fallback).trim() || fallback;
  if (!/^[a-zA-Z0-9._%-]+$/.test(value)) {
    throw new Error("Invalid MySQL remote host pattern");
  }
  if (value === "%") {
    if (opts?.allowWorld) return value;
    throw new Error(
      "MySQL remote '%' (world) is not allowed — use 172.% or another private pattern",
    );
  }
  const privateOk =
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "172.%" ||
    value === "10.%" ||
    value === "192.168.%" ||
    /^172\.\d{1,3}\.%$/.test(value) ||
    /^10\.\d{1,3}\.%$/.test(value) ||
    /^192\.168\.\d{1,3}\.%$/.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(value) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(value);
  if (!privateOk) {
    throw new Error(
      "MySQL remote must be a private Docker/LAN pattern (e.g. 172.%)",
    );
  }
  return value;
}

async function mysqlExecSql(sql: string): Promise<string> {
  return withMysqlDefaultsFile(async (defaultsFile) => {
    const { stdout, stderr } = await docker(
      [
        "exec",
        MYSQL_CONTAINER,
        "mysql",
        `--defaults-extra-file=${defaultsFile}`,
        "-N",
        "-e",
        sql,
      ],
      { timeout: 30_000 },
    );
    return `${stdout || ""}${stderr || ""}`
      .split(/\r?\n/)
      .filter(
        (line) => line && !line.includes("Using a password on the command line"),
      )
      .join("\n")
      .trim();
  });
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
  const remote = assertSafeMysqlRemote(input.remote);

  const user = escapeSqlLiteral(username);
  const pass = escapeSqlLiteral(password);
  const host = escapeSqlLiteral(remote);

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
  // Allow legacy '%' only for DROP cleanup; default stays private.
  const remote = assertSafeMysqlRemote(input.remote, {
    allowWorld: true,
    fallback: "172.%",
  });
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
  const remote = assertSafeMysqlRemote(input.remote);

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
  await withMysqlDefaultsFile(async (defaultsFile) => {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          MYSQL_CONTAINER,
          "mysqldump",
          `--defaults-extra-file=${defaultsFile}`,
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
  await withMysqlDefaultsFile(async (defaultsFile) => {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          MYSQL_CONTAINER,
          "mysql",
          `--defaults-extra-file=${defaultsFile}`,
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
