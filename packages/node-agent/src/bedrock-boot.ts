import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BEDROCK_CONTAINER_DNS, parseBdsAllowlistJson, serializeBdsAllowlist } from "@msm/shared";
import { docker } from "./docker.js";

export const BEDROCK_RUNTIME_IMAGE = "guartrix/bedrock-runtime:22.04";

function parseProperties(raw: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    props[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return props;
}

function serializeProperties(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}=${v ?? ""}`)
    .join("\n")
    .concat("\n");
}

function isOnlineMode(props: Record<string, string>): boolean {
  const v = props["online-mode"]?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return true;
}

/** DNS for BDS containers: host resolvers + public fallbacks (Microsoft auth). */
export async function bedrockContainerDnsServers(): Promise<string[]> {
  const servers = new Set<string>(BEDROCK_CONTAINER_DNS);
  try {
    const raw = await fsp.readFile("/etc/resolv.conf", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*nameserver\s+(\S+)/i);
      if (m?.[1] && /^[\d.a-fA-F:]+$/.test(m[1])) {
        servers.add(m[1]);
      }
    }
  } catch {
    // ignore
  }
  return [...servers];
}

/** ubuntu:22.04 has no CA bundle — BDS cannot reach Microsoft auth without this image. */
export async function bedrockRuntimeImageExists(): Promise<boolean> {
  const { stdout } = await docker(["images", "-q", BEDROCK_RUNTIME_IMAGE]);
  return Boolean(stdout.trim());
}

export async function ensureBedrockRuntimeImage(): Promise<void> {
  if (await bedrockRuntimeImageExists()) return;

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), "guartrix-bedrock-img-"));
  try {
    await fsp.writeFile(
      path.join(staging, "Dockerfile"),
      [
        "FROM ubuntu:22.04",
        "RUN apt-get update \\",
        "  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates \\",
        "  && rm -rf /var/lib/apt/lists/*",
        "",
      ].join("\n"),
      "utf8",
    );
    await docker(["build", "-t", BEDROCK_RUNTIME_IMAGE, staging], {
      timeout: 600_000,
    });
  } finally {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Sync BDS server.properties before container start. Defaults to online mode
 * (Xbox verification). Offline mode forces allow-list off (BDS requirement).
 */
export async function ensureBdsBootProperties(serverDir: string, port: number): Promise<string[]> {
  const warnings: string[] = [];
  const file = path.join(serverDir, "server.properties");
  let raw = "";
  try {
    raw = await fsp.readFile(file, "utf8");
  } catch {
    raw = "";
  }
  const props = parseProperties(raw);
  props["server-port"] = String(port);
  if (props["online-mode"] === undefined || props["online-mode"] === "") {
    props["online-mode"] = "true";
  }
  props["enable-lan-visibility"] = "true";
  props.transport = "raknet";
  const online = isOnlineMode(props);
  if (online) {
    let allowlistCount = 0;
    try {
      const raw = await fsp.readFile(path.join(serverDir, "allowlist.json"), "utf8");
      allowlistCount = parseBdsAllowlistJson(raw).length;
    } catch {
      allowlistCount = 0;
    }
    if (props["allow-list"] === "true" && allowlistCount === 0) {
      props["allow-list"] = "false";
      warnings.push(
        "Allowlist was on but empty — turned off so players can join (add names under Players to enable).",
      );
    }
  }
  if (!online) {
    props["allow-list"] = "false";
    await fsp.writeFile(path.join(serverDir, "allowlist.json"), serializeBdsAllowlist([]), "utf8");
  }
  await fsp.writeFile(file, serializeProperties(props), "utf8");
  return warnings;
}
