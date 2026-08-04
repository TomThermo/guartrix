import type { ServerProperties } from "@msm/shared";
import { EDITABLE_PROPERTY_KEYS } from "@msm/shared";
import { daemonReadFile, daemonWriteFile } from "../nodes/daemon-client.js";

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

/** Read server.properties via the owning daemon (multi-node). */
export async function readServerProperties(
  serverId: string,
): Promise<ServerProperties> {
  try {
    const res = (await daemonReadFile(serverId, "server.properties")) as {
      content?: string;
    };
    return parseProperties(res.content ?? "");
  } catch {
    return {};
  }
}

export async function updateServerProperties(
  serverId: string,
  updates: ServerProperties,
  port?: number,
): Promise<ServerProperties> {
  const current = await readServerProperties(serverId);
  const allowed = new Set<string>(EDITABLE_PROPERTY_KEYS);

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (!allowed.has(key) && key !== "server-port") continue;
    current[key] = String(value);
  }

  if (port !== undefined) {
    current["server-port"] = String(port);
  }

  const lines = Object.entries(current).map(([k, v]) => `${k}=${v ?? ""}`);
  await daemonWriteFile(serverId, "server.properties", lines.join("\n") + "\n");
  return current;
}
