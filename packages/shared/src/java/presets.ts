/**
 * Default startup template. Placeholders:
 * - {{MEMORY}} / {{SERVER_MEMORY}} → heap MB
 * - {{JAR}} → server jar filename (default server.jar)
 */
export const DEFAULT_STARTUP_COMMAND = "java -Xms128M -Xmx{{MEMORY}}M -jar {{JAR}} nogui";

/** Forge/NeoForge: heap only — applied via user_jvm_args.txt (run.sh starts the server). */
export const FORGE_DEFAULT_STARTUP_COMMAND = "java -Xms{{MEMORY}}M -Xmx{{MEMORY}}M";

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

/** Bedrock BDS native binary (LD_LIBRARY_PATH is set on the container). */
export const BEDROCK_DEFAULT_STARTUP_COMMAND = "./bedrock_server";
/** PocketMine-MP phar via PHP. */
export const POCKETMINE_DEFAULT_STARTUP_COMMAND =
  "php -d memory_limit={{MEMORY}}M PocketMine-MP.phar";

export type ServerRuntimeKind = "java" | "bedrock_native" | "php";

export type StartupPresetId = "default" | "aikar" | "performance" | "modded";

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
  | "QUILT"
  | "BEDROCK"
  | "BEDROCK_PREVIEW"
  | "POCKETMINE"
  | "NUKKIT";

/** Presets for a given server software (Aikar = Paper family only). */
export function startupPresetsFor(type: StartupPresetServerType): StartupPreset[] {
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

  const bedrock: StartupPreset = {
    id: "default",
    label: "Default",
    hint: "Native bedrock_server binary (LD_LIBRARY_PATH set by container)",
    command: BEDROCK_DEFAULT_STARTUP_COMMAND,
  };
  const pocketmine: StartupPreset = {
    id: "default",
    label: "Default",
    hint: "PHP with memory_limit from {{MEMORY}}",
    command: POCKETMINE_DEFAULT_STARTUP_COMMAND,
  };

  switch (type) {
    case "BEDROCK":
    case "BEDROCK_PREVIEW":
      return [bedrock];
    case "POCKETMINE":
      return [pocketmine];
    case "NUKKIT":
      return [jarDefault, modded];
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
