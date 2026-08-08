import { DEFAULT_STARTUP_COMMAND, type ServerRuntimeKind } from "./presets.js";

export const DEFAULT_SERVER_JAR = "server.jar";

/** Server jar filename: name.jar */
export const SERVER_JAR_REGEX = /^([\w.-]+)\.jar$/i;

export function isValidServerJar(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return false;
  return SERVER_JAR_REGEX.test(trimmed);
}

export function normalizeServerJar(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return DEFAULT_SERVER_JAR;
  if (!isValidServerJar(trimmed)) {
    throw new Error(
      "Server jar must be a simple filename ending in .jar (e.g. server.jar, paper-1.21.jar)",
    );
  }
  return trimmed;
}

export function defaultStartupCommand(memoryMb: number, jarName = DEFAULT_SERVER_JAR): string {
  return resolveStartupCommand(DEFAULT_STARTUP_COMMAND, memoryMb, jarName);
}

export function resolveStartupCommand(
  template: string | null | undefined,
  memoryMb: number,
  jarName = DEFAULT_SERVER_JAR,
): string {
  const jar = (() => {
    try {
      return normalizeServerJar(jarName);
    } catch {
      return DEFAULT_SERVER_JAR;
    }
  })();
  const raw = (template?.trim() || DEFAULT_STARTUP_COMMAND).replace(/\s+/g, " ").trim();
  return raw
    .replaceAll("{{MEMORY}}", String(memoryMb))
    .replaceAll("{{SERVER_MEMORY}}", String(memoryMb))
    .replaceAll("{{JAR}}", jar);
}

/**
 * Parse a single -Xms / -Xmx value to megabytes.
 * Supports K/M/G suffixes (Java-style) and plain bytes.
 */
export function parseJvmHeapMb(flag: string): number | null {
  const m = /^(-Xm[sx])(\d+)([kKmMgG])?$/.exec(flag.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = (m[3] ?? "").toUpperCase();
  switch (unit) {
    case "G":
      return Math.ceil(n * 1024);
    case "M":
      return n;
    case "K":
      return Math.ceil(n / 1024);
    default:
      // No suffix = bytes
      return Math.ceil(n / (1024 * 1024));
  }
}

export type StartupHeapCheck = {
  ok: boolean;
  xmsMb: number | null;
  xmxMb: number | null;
  error?: string;
};

/**
 * Ensure resolved -Xms/-Xmx never exceed the server's allocated memoryMb.
 * Call after resolveStartupCommand (or pass template + memoryMb).
 */
export function checkStartupHeapLimit(
  commandOrTemplate: string | null | undefined,
  memoryMb: number,
  jarName = DEFAULT_SERVER_JAR,
): StartupHeapCheck {
  let resolved: string;
  try {
    resolved = resolveStartupCommand(commandOrTemplate, memoryMb, jarName);
  } catch (err) {
    return {
      ok: false,
      xmsMb: null,
      xmxMb: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let xmsMb: number | null = null;
  let xmxMb: number | null = null;
  try {
    for (const arg of startupCommandToArgs(resolved)) {
      if (arg.startsWith("-Xms")) {
        const mb = parseJvmHeapMb(arg);
        if (mb != null) xmsMb = mb;
      } else if (arg.startsWith("-Xmx")) {
        const mb = parseJvmHeapMb(arg);
        if (mb != null) xmxMb = mb;
      }
    }
  } catch (err) {
    return {
      ok: false,
      xmsMb: null,
      xmxMb: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (xmxMb != null && xmxMb > memoryMb) {
    return {
      ok: false,
      xmsMb,
      xmxMb,
      error: `-Xmx (${xmxMb} MB) exceeds this server’s allocated RAM (${memoryMb} MB). Use {{MEMORY}} or a value ≤ ${memoryMb}M.`,
    };
  }
  if (xmsMb != null && xmsMb > memoryMb) {
    return {
      ok: false,
      xmsMb,
      xmxMb,
      error: `-Xms (${xmsMb} MB) exceeds this server’s allocated RAM (${memoryMb} MB). Use {{MEMORY}} or a value ≤ ${memoryMb}M.`,
    };
  }
  if (xmsMb != null && xmxMb != null && xmsMb > xmxMb) {
    return {
      ok: false,
      xmsMb,
      xmxMb,
      error: `-Xms (${xmsMb} MB) cannot be greater than -Xmx (${xmxMb} MB).`,
    };
  }

  return { ok: true, xmsMb, xmxMb };
}

export function assertStartupHeapWithinLimit(
  commandOrTemplate: string | null | undefined,
  memoryMb: number,
  jarName = DEFAULT_SERVER_JAR,
): void {
  const check = checkStartupHeapLimit(commandOrTemplate, memoryMb, jarName);
  if (!check.ok) {
    throw new Error(check.error ?? "Startup heap exceeds allocated RAM");
  }
}

/**
 * Startup must be a safe argv-only command (no shell metacharacters).
 * Java/PHP templates use `java` or `php`; Bedrock uses `./bedrock_server`.
 */
export function assertSafeStartupCommand(
  commandOrTemplate: string | null | undefined,
  memoryMb: number,
  jarName = DEFAULT_SERVER_JAR,
  runtimeKind: ServerRuntimeKind = "java",
): void {
  const trimmed = (commandOrTemplate ?? "").trim();
  if (!trimmed) return;
  const resolved = resolveStartupCommand(trimmed, memoryMb, jarName);
  const args = startupCommandToArgs(resolved);

  if (runtimeKind === "bedrock_native") {
    const bin = args[0];
    if (bin !== "./bedrock_server" && bin !== "bedrock_server") {
      throw new Error("Bedrock startup must run ./bedrock_server");
    }
  } else if (runtimeKind === "php") {
    if (args[0] !== "php") {
      throw new Error('PocketMine startup command must start with "php"');
    }
  } else {
    if (args[0] !== "java") {
      throw new Error('Startup command must start with "java"');
    }
  }

  for (const a of args) {
    if (/[;&|`$<>]/.test(a) || a.includes("\0")) {
      throw new Error("Startup command contains forbidden shell characters");
    }
  }

  if (runtimeKind === "java") {
    assertStartupHeapWithinLimit(trimmed, memoryMb, jarName);
  }
}

/**
 * Extract JVM args from a resolved startup command for Forge user_jvm_args.txt.
 * Drops `java`, `-jar …`, and `nogui` / `--nogui`.
 */
export function jvmArgsFromStartupCommand(command: string): string[] {
  const args = startupCommandToArgs(command);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "java") continue;
    if (a === "-jar") {
      i += 1;
      continue;
    }
    if (a === "nogui" || a === "--nogui") continue;
    out.push(a);
  }
  return out;
}

/** Split a resolved startup command into argv for Docker/exec. */
export function startupCommandToArgs(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) throw new Error("Startup command is empty");
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error("Unclosed quote in startup command");
  if (current) args.push(current);
  if (args.length === 0) throw new Error("Startup command is empty");
  return args;
}
