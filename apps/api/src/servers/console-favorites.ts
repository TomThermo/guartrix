import { daemonReadFile, daemonWriteFile } from "../nodes/daemon-client.js";

const FILE = "guartrix-console-favorites.json";
const MAX = 24;

export async function getConsoleFavorites(serverId: string): Promise<string[]> {
  try {
    const res = (await daemonReadFile(serverId, FILE)) as { content?: string };
    const raw = res.content ?? "[]";
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export async function setConsoleFavorites(
  serverId: string,
  commands: string[],
): Promise<string[]> {
  const cleaned = [
    ...new Set(
      commands
        .map((c) => c.trim().replace(/^\/+/, ""))
        .filter((c) => c.length > 0 && c.length <= 200),
    ),
  ].slice(0, MAX);
  await daemonWriteFile(serverId, FILE, JSON.stringify(cleaned, null, 2) + "\n");
  return cleaned;
}
