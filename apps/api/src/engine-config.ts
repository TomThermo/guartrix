import YAML from "yaml";
import type { ServerType } from "@msm/shared";
import { daemonReadFile, daemonWriteFile } from "./daemon-client.js";

export type EngineFieldType = "boolean" | "number" | "string";

export interface EngineFieldDef {
  id: string;
  file: string;
  /** Dot path into YAML object */
  path: string;
  label: string;
  hint?: string;
  type: EngineFieldType;
  defaultValue?: boolean | number | string;
}

/** Guided keys for Paper / Purpur (v1 whitelist). */
export const ENGINE_FIELDS: EngineFieldDef[] = [
  {
    id: "paper-chunk-loading-threads",
    file: "config/paper-global.yml",
    path: "chunk-loading.basic.player-max-chunk-generate-rate",
    label: "Player chunk generate rate",
    hint: "paper-global.yml",
    type: "number",
  },
  {
    id: "paper-spam-limiter",
    file: "config/paper-global.yml",
    path: "spam-limiter.incoming-packet-threshold",
    label: "Incoming packet spam threshold",
    type: "number",
  },
  {
    id: "spigot-view-distance",
    file: "spigot.yml",
    path: "world-settings.default.view-distance",
    label: "Spigot view-distance",
    hint: "Use 'default' to follow server.properties",
    type: "string",
    defaultValue: "default",
  },
  {
    id: "spigot-mob-spawn",
    file: "spigot.yml",
    path: "world-settings.default.mob-spawn-range",
    label: "Mob spawn range",
    type: "number",
  },
  {
    id: "spigot-nerf-spawner",
    file: "spigot.yml",
    path: "world-settings.default.nerf-spawner-mobs",
    label: "Nerf spawner mobs",
    type: "boolean",
  },
  {
    id: "spigot-merge-radius-item",
    file: "spigot.yml",
    path: "world-settings.default.merge-radius.item",
    label: "Item merge radius",
    type: "number",
  },
  {
    id: "purpur-villager-lobotomize",
    file: "purpur.yml",
    path: "settings.villager.lobotomize.enabled",
    label: "Lobotomize stuck villagers",
    hint: "Purpur only",
    type: "boolean",
  },
  {
    id: "purpur-use-alternate-keepalive",
    file: "purpur.yml",
    path: "settings.use-alternate-keepalive",
    label: "Alternate keepalive",
    hint: "Purpur only",
    type: "boolean",
  },
];

function getAt(obj: unknown, dotted: string): unknown {
  const parts = dotted.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setAt(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

async function readYamlFile(
  serverId: string,
  relPath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = (await daemonReadFile(serverId, relPath)) as { content?: string };
    const raw = res.content ?? "";
    if (!raw.trim()) return {};
    const parsed = YAML.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function engineSupported(type: ServerType): boolean {
  return type === "PAPER" || type === "PURPUR";
}

export async function getEngineSettings(
  serverId: string,
  type: ServerType,
): Promise<{
  supported: boolean;
  fields: Array<{
    id: string;
    file: string;
    label: string;
    hint?: string;
    type: EngineFieldType;
    value: boolean | number | string | null;
    present: boolean;
  }>;
}> {
  if (!engineSupported(type)) {
    return { supported: false, fields: [] };
  }

  const fileCache = new Map<string, Record<string, unknown> | null>();
  async function load(file: string) {
    if (!fileCache.has(file)) {
      fileCache.set(file, await readYamlFile(serverId, file));
    }
    return fileCache.get(file)!;
  }

  const fields = [];
  for (const def of ENGINE_FIELDS) {
    if (def.file === "purpur.yml" && type !== "PURPUR") continue;
    const doc = await load(def.file);
    const present = doc != null;
    const raw = present ? getAt(doc, def.path) : undefined;
    let value: boolean | number | string | null = null;
    if (raw === undefined || raw === null) {
      value =
        def.defaultValue !== undefined
          ? (def.defaultValue as boolean | number | string)
          : null;
    } else if (def.type === "boolean") {
      value = Boolean(raw);
    } else if (def.type === "number") {
      value = typeof raw === "number" ? raw : Number(raw);
    } else {
      value = String(raw);
    }
    fields.push({
      id: def.id,
      file: def.file,
      label: def.label,
      hint: def.hint,
      type: def.type,
      value: Number.isNaN(value as number) ? null : value,
      present,
    });
  }

  return { supported: true, fields };
}

export async function updateEngineSettings(
  serverId: string,
  type: ServerType,
  updates: Record<string, boolean | number | string>,
): Promise<Awaited<ReturnType<typeof getEngineSettings>>> {
  if (!engineSupported(type)) {
    throw new Error("Engine settings are only available for Paper and Purpur");
  }

  const byFile = new Map<string, EngineFieldDef[]>();
  for (const def of ENGINE_FIELDS) {
    if (def.file === "purpur.yml" && type !== "PURPUR") continue;
    if (!(def.id in updates)) continue;
    const list = byFile.get(def.file) ?? [];
    list.push(def);
    byFile.set(def.file, list);
  }

  for (const [file, defs] of byFile) {
    let doc = (await readYamlFile(serverId, file)) ?? {};
    for (const def of defs) {
      const v = updates[def.id];
      if (v === undefined) continue;
      if (def.type === "boolean") setAt(doc, def.path, Boolean(v));
      else if (def.type === "number") setAt(doc, def.path, Number(v));
      else setAt(doc, def.path, String(v));
    }
    const out = YAML.stringify(doc, { lineWidth: 120 });
    await daemonWriteFile(serverId, file, out);
  }

  return getEngineSettings(serverId, type);
}
