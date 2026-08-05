import type { ServerProperties } from "@msm/shared";
import {
  EDITABLE_PROPERTY_KEYS,
  isBdsServerType,
  type ServerType,
} from "@msm/shared";
import { daemonReadFile, daemonWriteFile } from "../nodes/daemon-client.js";
import { prisma } from "../db.js";

function parseProperties(raw: string): ServerProperties {
  const props: ServerProperties = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    props[key] = value;
  }
  return props;
}

/** Map BDS allow-list to white-list for the panel UI. */
function normalizePropertiesForUi(
  props: ServerProperties,
  type?: ServerType | null,
): ServerProperties {
  if (type && isBdsServerType(type)) {
    if (props["allow-list"] !== undefined) {
      props["white-list"] = props["allow-list"];
    }
  }
  return props;
}

/** Write BDS allow-list when the UI toggles white-list. */
function applyBedrockWhitelistAlias(
  current: ServerProperties,
  updates: ServerProperties,
  type?: ServerType | null,
): void {
  if (!type || !isBdsServerType(type)) return;
  if (updates["white-list"] !== undefined) {
    current["allow-list"] = updates["white-list"];
    delete current["white-list"];
  }
}

/** Read server.properties via the owning daemon (multi-node). */
export async function readServerProperties(
  serverId: string,
): Promise<ServerProperties> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { type: true },
  });
  try {
    const res = (await daemonReadFile(serverId, "server.properties")) as {
      content?: string;
    };
    return normalizePropertiesForUi(
      parseProperties(res.content ?? ""),
      server?.type,
    );
  } catch {
    return {};
  }
}

export async function updateServerProperties(
  serverId: string,
  updates: ServerProperties,
  port?: number,
): Promise<ServerProperties> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { type: true },
  });
  const current = await readServerProperties(serverId);
  const allowed = new Set<string>(EDITABLE_PROPERTY_KEYS);

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (!allowed.has(key) && key !== "server-port") continue;
    current[key] = String(value);
  }

  applyBedrockWhitelistAlias(current, updates, server?.type);

  if (port !== undefined) {
    current["server-port"] = String(port);
  }

  const fileProps = { ...current };
  if (server?.type && isBdsServerType(server.type as ServerType)) {
    delete fileProps["white-list"];
  }

  const lines = Object.entries(fileProps).map(([k, v]) => `${k}=${v ?? ""}`);
  await daemonWriteFile(serverId, "server.properties", lines.join("\n") + "\n");
  return normalizePropertiesForUi(fileProps, server?.type);
}
