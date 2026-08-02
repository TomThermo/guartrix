/** Supported Minecraft runtime Java versions → Docker images. */
export const JAVA_VERSIONS = [
  {
    version: "8",
    label: "Java 8",
    image: "eclipse-temurin:8-jre-jammy",
  },
  {
    version: "11",
    label: "Java 11",
    image: "eclipse-temurin:11-jre-jammy",
  },
  {
    version: "17",
    label: "Java 17",
    image: "eclipse-temurin:17-jre-jammy",
  },
  {
    version: "21",
    label: "Java 21",
    image: "eclipse-temurin:21-jre-jammy",
  },
  {
    version: "25",
    label: "Java 25",
    image: "eclipse-temurin:25-jre-jammy",
  },
] as const;

export type JavaVersion = (typeof JAVA_VERSIONS)[number]["version"];

export const DEFAULT_JAVA_VERSION: JavaVersion = "25";

const JAVA_VERSION_SET = new Set<string>(JAVA_VERSIONS.map((j) => j.version));

export function isJavaVersion(v: string): v is JavaVersion {
  return JAVA_VERSION_SET.has(v);
}

export function normalizeJavaVersion(
  value: string | null | undefined,
): JavaVersion {
  if (value && isJavaVersion(value)) return value;
  // Legacy: absolute path stored in javaPath — map by folder name if possible
  if (value && value.includes("java-")) {
    const m = /java-(\d+)/.exec(value);
    if (m && isJavaVersion(m[1]!)) return m[1];
  }
  return DEFAULT_JAVA_VERSION;
}

export function dockerImageForJava(version: string | null | undefined): string {
  const v = normalizeJavaVersion(version);
  return JAVA_VERSIONS.find((j) => j.version === v)!.image;
}

/**
 * Default startup template. Placeholders:
 * - {{MEMORY}} / {{SERVER_MEMORY}} → heap MB
 * - {{JAR}} → server jar filename (default server.jar)
 */
export const DEFAULT_STARTUP_COMMAND =
  "java -Xms128M -Xmx{{MEMORY}}M -jar {{JAR}} nogui";

/** Forge/NeoForge: heap only — applied via user_jvm_args.txt (run.sh starts the server). */
export const FORGE_DEFAULT_STARTUP_COMMAND =
  "java -Xms{{MEMORY}}M -Xmx{{MEMORY}}M";

/**
 * Well-known Aikar G1GC flags (https://mcflags.emc.gs) — Paper/Purpur standard.
 * Aikar recommends -Xms equal to -Xmx.
 */
const AIKAR_G1_FLAGS = [
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=200",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+DisableExplicitGC",
  // AlwaysPreTouch omitted: with -Xms=-Xmx it commits the full heap at once and
  // often OOM-kills Docker containers (limit ≈ heap + small overhead).
  "-XX:G1NewSizePercent=30",
  "-XX:G1MaxNewSizePercent=40",
  "-XX:G1HeapRegionSize=8M",
  "-XX:G1ReservePercent=20",
  "-XX:G1HeapWastePercent=5",
  "-XX:G1MixedGCCountTarget=4",
  "-XX:InitiatingHeapOccupancyPercent=15",
  "-XX:G1MixedGCLiveThresholdPercent=90",
  "-XX:G1RSetUpdatingPauseTimePercent=5",
  "-XX:SurvivorRatio=32",
  "-XX:+PerfDisableSharedMem",
  "-XX:MaxTenuringThreshold=1",
  "-Dusing.aikars.flags=https://mcflags.emc.gs",
  "-Daikars.new.flags=true",
].join(" ");

/**
 * Modded (Fabric/Quilt/Forge) G1 tuning: larger young gen / regions for heavier allocation.
 */
const MODDED_G1_FLAGS = [
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=200",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+DisableExplicitGC",
  "-XX:G1NewSizePercent=40",
  "-XX:G1MaxNewSizePercent=50",
  "-XX:G1HeapRegionSize=16M",
  "-XX:G1ReservePercent=15",
  "-XX:G1HeapWastePercent=5",
  "-XX:G1MixedGCCountTarget=4",
  "-XX:InitiatingHeapOccupancyPercent=20",
  "-XX:G1MixedGCLiveThresholdPercent=90",
  "-XX:G1RSetUpdatingPauseTimePercent=5",
  "-XX:SurvivorRatio=32",
  "-XX:+PerfDisableSharedMem",
  "-XX:MaxTenuringThreshold=1",
].join(" ");

export const AIKAR_STARTUP_COMMAND = [
  "java",
  AIKAR_G1_FLAGS,
  "-Xms{{MEMORY}}M -Xmx{{MEMORY}}M -jar {{JAR}} nogui",
].join(" ");

export const PERFORMANCE_STARTUP_COMMAND = AIKAR_STARTUP_COMMAND;

export const MODDED_STARTUP_COMMAND = [
  "java",
  MODDED_G1_FLAGS,
  "-Xms{{MEMORY}}M -Xmx{{MEMORY}}M -jar {{JAR}} nogui",
].join(" ");

/** Same modded G1 flags for Forge — jar/nogui ignored; flags go to user_jvm_args.txt. */
export const FORGE_MODDED_STARTUP_COMMAND = [
  "java",
  MODDED_G1_FLAGS,
  "-Xms{{MEMORY}}M -Xmx{{MEMORY}}M",
].join(" ");

export type StartupPresetId =
  | "default"
  | "aikar"
  | "performance"
  | "modded";

export type StartupPreset = {
  id: StartupPresetId;
  label: string;
  hint: string;
  command: string;
};

export type StartupPresetServerType =
  | "VANILLA"
  | "PAPER"
  | "FABRIC"
  | "FORGE"
  | "PURPUR"
  | "NEOFORGE"
  | "QUILT";

/** Presets for a given server software (Aikar = Paper family only). */
export function startupPresetsFor(
  type: StartupPresetServerType,
): StartupPreset[] {
  const jarDefault: StartupPreset = {
    id: "default",
    label: "Default",
    hint: "Heap + jar + nogui",
    command: DEFAULT_STARTUP_COMMAND,
  };
  const aikar: StartupPreset = {
    id: "aikar",
    label: "Aikar’s flags",
    hint: "Paper/Purpur G1GC (https://mcflags.emc.gs); Xms=Xmx",
    command: AIKAR_STARTUP_COMMAND,
  };
  const performance: StartupPreset = {
    id: "performance",
    label: "Performance (G1GC)",
    hint: "Aikar-style G1GC for Vanilla; Xms=Xmx",
    command: PERFORMANCE_STARTUP_COMMAND,
  };
  const modded: StartupPreset = {
    id: "modded",
    label: "Modded G1GC",
    hint: "Larger young gen for Fabric/Quilt mods; Xms=Xmx",
    command: MODDED_STARTUP_COMMAND,
  };
  const forgeDefault: StartupPreset = {
    id: "default",
    label: "Default",
    hint: "Xms=Xmx only → user_jvm_args.txt (run.sh)",
    command: FORGE_DEFAULT_STARTUP_COMMAND,
  };
  const forgeModded: StartupPreset = {
    id: "modded",
    label: "Modded G1GC",
    hint: "G1 flags → user_jvm_args.txt; run.sh still starts the server",
    command: FORGE_MODDED_STARTUP_COMMAND,
  };

  switch (type) {
    case "PAPER":
    case "PURPUR":
      return [jarDefault, aikar];
    case "VANILLA":
      return [jarDefault, performance];
    case "FABRIC":
    case "QUILT":
      return [jarDefault, modded];
    case "FORGE":
    case "NEOFORGE":
      return [forgeDefault, forgeModded];
    default:
      return [jarDefault];
  }
}

/** @deprecated Prefer startupPresetsFor(serverType) */
export const STARTUP_PRESETS: readonly StartupPreset[] = startupPresetsFor("PAPER");

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
 * Startup must be a java invocation only (no shell, no other binaries).
 * Forge JVM templates also start with `java`.
 */
export function assertSafeStartupCommand(
  commandOrTemplate: string | null | undefined,
  memoryMb: number,
  jarName = DEFAULT_SERVER_JAR,
): void {
  const trimmed = (commandOrTemplate ?? "").trim();
  if (!trimmed) return;
  const resolved = resolveStartupCommand(trimmed, memoryMb, jarName);
  const args = startupCommandToArgs(resolved);
  if (args[0] !== "java") {
    throw new Error('Startup command must start with "java"');
  }
  for (const a of args) {
    if (/[;&|`$<>]/.test(a) || a.includes("\0")) {
      throw new Error("Startup command contains forbidden shell characters");
    }
  }
  // Disallow replacing java with a path to another binary
  if (args[0] !== "java") {
    throw new Error('Startup binary must be "java"');
  }
  assertStartupHeapWithinLimit(trimmed, memoryMb, jarName);
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
