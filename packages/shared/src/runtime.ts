import type { ServerType } from "./types/server.js";
import {
  assertSafeStartupCommand,
  BEDROCK_DEFAULT_STARTUP_COMMAND,
  DEFAULT_STARTUP_COMMAND,
  POCKETMINE_DEFAULT_STARTUP_COMMAND,
  dockerImageForJava,
  normalizeJavaVersion,
  type JavaVersion,
  type ServerRuntimeKind,
} from "./java.js";

export type { ServerRuntimeKind };

export const BEDROCK_SERVER_TYPES: ServerType[] = [
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
];

export const JAVA_SERVER_TYPES: ServerType[] = [
  "VANILLA",
  "PAPER",
  "PURPUR",
  "FABRIC",
  "QUILT",
  "FORGE",
  "NEOFORGE",
];

export function runtimeKindFor(type: ServerType): ServerRuntimeKind {
  switch (type) {
    case "BEDROCK":
    case "BEDROCK_PREVIEW":
      return "bedrock_native";
    case "POCKETMINE":
      return "php";
    default:
      return "java";
  }
}

/** Bedrock-protocol servers (native BDS, PMMP, Nukkit). */
export function isBedrockProtocolServer(type: ServerType): boolean {
  return (
    type === "BEDROCK" ||
    type === "BEDROCK_PREVIEW" ||
    type === "POCKETMINE" ||
    type === "NUKKIT"
  );
}

export function primaryAllocationProtocol(type: ServerType): "tcp" | "udp" {
  return isBedrockProtocolServer(type) ? "udp" : "tcp";
}

/** Default game port (Java TCP / Bedrock UDP). */
export const DEFAULT_JAVA_PORT = 25565;
export const DEFAULT_BEDROCK_PORT = 19132;

export function defaultGamePortForType(type: ServerType): number {
  return isBedrockProtocolServer(type) ? DEFAULT_BEDROCK_PORT : DEFAULT_JAVA_PORT;
}

/** Mojang BDS uses allow-list + allowlist.json (not Java white-list). */
export function isBdsServerType(type: ServerType): boolean {
  return type === "BEDROCK" || type === "BEDROCK_PREVIEW";
}

/** server.properties key for the whitelist toggle in the panel UI. */
export function whitelistPropertyKey(type: ServerType): "white-list" | "allow-list" {
  return isBdsServerType(type) ? "allow-list" : "white-list";
}

/** Console log line that means the game loop is accepting players. */
export function consoleLineIndicatesReady(line: string, type?: ServerType): boolean {
  if (/Done\s*\([\d.]+s\)!/i.test(line)) return true;
  if (type && isBdsServerType(type)) {
    // BDS prefixes lines with [timestamp INFO] — do not anchor to end of line.
    if (/Server started\.?/i.test(line)) return true;
    if (/Dedicated Server.*running/i.test(line)) return true;
  }
  return false;
}

/** BDS boot failure before the game loop is up (online-mode / Microsoft services). */
export function consoleLineIndicatesBootFailure(
  line: string,
  type?: ServerType,
): boolean {
  if (!type || !isBdsServerType(type)) return false;
  return /Could not connect to Minecraft services/i.test(line);
}

export const BEDROCK_DOCKER_IMAGE = "guartrix/bedrock-runtime:22.04";
export const POCKETMINE_DOCKER_IMAGE = "pmmp/pocketmine-mp:latest";

export function dockerImageForServerType(
  type: ServerType,
  javaVersion?: string | null,
): string {
  switch (type) {
    case "BEDROCK":
    case "BEDROCK_PREVIEW":
      return BEDROCK_DOCKER_IMAGE;
    case "POCKETMINE":
      return POCKETMINE_DOCKER_IMAGE;
    default:
      return dockerImageForJava(javaVersion);
  }
}

export const BEDROCK_BINARY = "bedrock_server";
export const POCKETMINE_PHAR = "PocketMine-MP.phar";

export function defaultServerExecutable(type: ServerType): string {
  switch (type) {
    case "BEDROCK":
    case "BEDROCK_PREVIEW":
      return BEDROCK_BINARY;
    case "POCKETMINE":
      return POCKETMINE_PHAR;
    default:
      return "server.jar";
  }
}

const EXECUTABLE_REGEX = /^[\w.-]+(\.(jar|phar))?$/i;

export function isValidServerExecutable(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return false;
  if (trimmed === BEDROCK_BINARY) return true;
  return EXECUTABLE_REGEX.test(trimmed);
}

export function normalizeServerExecutable(
  name: string | null | undefined,
  type?: ServerType,
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return defaultServerExecutable(type ?? "VANILLA");
  if (!isValidServerExecutable(trimmed)) {
    throw new Error(
      "Server executable must be a simple filename (e.g. server.jar, PocketMine-MP.phar, bedrock_server)",
    );
  }
  return trimmed;
}

export function defaultStartupTemplateForType(type: ServerType): string {
  switch (runtimeKindFor(type)) {
    case "bedrock_native":
      return BEDROCK_DEFAULT_STARTUP_COMMAND;
    case "php":
      return POCKETMINE_DEFAULT_STARTUP_COMMAND;
    default:
      return DEFAULT_STARTUP_COMMAND;
  }
}

export function assertSafeStartupCommandForType(
  type: ServerType,
  commandOrTemplate: string | null | undefined,
  memoryMb: number,
  executableName?: string,
): void {
  assertSafeStartupCommand(
    commandOrTemplate,
    memoryMb,
    executableName ?? defaultServerExecutable(type),
    runtimeKindFor(type),
  );
}

/** Docker env vars applied at container start for specific runtimes. */
export function containerEnvForRuntime(type: ServerType): Record<string, string> {
  if (type === "BEDROCK" || type === "BEDROCK_PREVIEW") {
    return { LD_LIBRARY_PATH: "." };
  }
  return {};
}

/** Reliable public DNS for BDS containers (embedded Docker DNS can block Microsoft auth). */
export const BEDROCK_CONTAINER_DNS = ["8.8.8.8", "1.1.1.1"] as const;

export function dnsServersForServerType(type: ServerType): readonly string[] {
  if (type === "BEDROCK" || type === "BEDROCK_PREVIEW") {
    return BEDROCK_CONTAINER_DNS;
  }
  return [];
}

/** Label shown in power/start logs (not necessarily the Docker image tag). */
export function runtimeLabelForServerType(
  type: ServerType,
  javaVersion?: string | null,
): string {
  switch (runtimeKindFor(type)) {
    case "bedrock_native":
      return "Bedrock BDS";
    case "php":
      return "PocketMine-MP (PHP)";
    default:
      const v = normalizeJavaVersion(javaVersion) as JavaVersion;
      return `Java ${v}`;
  }
}
