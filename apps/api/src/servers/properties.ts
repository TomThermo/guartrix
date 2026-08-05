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
  updates: ServerProperties,
  type?: ServerType | null,
): ServerProperties {
  if (!type || !isBdsServerType(type)) return updates;
  if (updates["white-list"] === undefined) return updates;
  const next = { ...updates };
  next["allow-list"] = updates["white-list"];
  delete next["white-list"];
  return next;
}

/**
 * Patch keys in the existing file text so comments / ordering stay intact.
 * Missing keys are appended at the end.
 */
function patchPropertiesText(
  raw: string,
  patches: Record<string, string>,
): string {
  const pending = new Map(Object.entries(patches));
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const endsWithNl = /(?:\r?\n)$/.test(raw);
  const lines = raw.length ? raw.split(/\r?\n/) : [];
  // split keeps a trailing empty string when file ends with newline
  if (endsWithNl && lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq);
    if (!pending.has(key)) return line;
    const value = pending.get(key)!;
    pending.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of pending) {
    out.push(`${key}=${value}`);
  }

  return out.join(nl) + nl;
}

async function readRawServerProperties(serverId: string): Promise<string> {
  try {
    const res = (await daemonReadFile(serverId, "server.properties")) as {
      content?: string;
    };
    return res.content ?? "";
  } catch {
    return "";
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
  const raw = await readRawServerProperties(serverId);
  return normalizePropertiesForUi(parseProperties(raw), server?.type);
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
  const raw = await readRawServerProperties(serverId);
  const current = parseProperties(raw);
  const allowed = new Set<string>(EDITABLE_PROPERTY_KEYS);

  const patches: Record<string, string> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (!allowed.has(key) && key !== "server-port") continue;
    patches[key] = String(value);
  }

  const aliased = applyBedrockWhitelistAlias(patches, server?.type);
  Object.assign(patches, aliased);
  delete patches["white-list"];

  if (port !== undefined) {
    patches["server-port"] = String(port);
    // Keep query.port in lockstep when present (same host port Minecraft uses).
    if (current["query.port"] !== undefined || patches["query.port"] !== undefined) {
      patches["query.port"] = String(port);
    }
  }

  const nextRaw = patchPropertiesText(raw, patches);
  await daemonWriteFile(serverId, "server.properties", nextRaw);
  return normalizePropertiesForUi(parseProperties(nextRaw), server?.type);
}
