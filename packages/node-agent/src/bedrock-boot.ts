import fsp from "node:fs/promises";
import path from "node:path";

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

/**
 * BDS in Docker needs LAN visibility + raknet; online-mode requires outbound
 * Microsoft services (often blocked on VPS). Sync port before each start.
 */
export async function ensureBdsBootProperties(
  serverDir: string,
  port: number,
): Promise<void> {
  const file = path.join(serverDir, "server.properties");
  let raw = "";
  try {
    raw = await fsp.readFile(file, "utf8");
  } catch {
    raw = "";
  }
  const props = parseProperties(raw);
  props["server-port"] = String(port);
  props["online-mode"] = "false";
  props["enable-lan-visibility"] = "true";
  props["transport"] = "raknet";
  if (props["allow-list"] === undefined) {
    props["allow-list"] = "false";
  }
  await fsp.writeFile(file, serializeProperties(props), "utf8");
}
