import { randomBytes } from "node:crypto";
import type { ServerType } from "@msm/shared";
import { updateServerProperties, readServerProperties } from "./properties.js";
import {
  engineSupported,
  getEngineSettings,
  updateEngineSettings,
} from "./engine-config.js";

export type ProxyMode = "none" | "velocity" | "bungeecord";

export async function getProxySetup(serverId: string, type: ServerType) {
  const props = await readServerProperties(serverId);
  const engine = engineSupported(type)
    ? await getEngineSettings(serverId, type)
    : { supported: false, fields: [] };
  const byId = Object.fromEntries(engine.fields.map((f) => [f.id, f]));
  const velocityOn = byId["paper-velocity-enabled"]?.value === true;
  const bungeeOn = byId["spigot-bungeecord"]?.value === true;
  let mode: ProxyMode = "none";
  if (velocityOn) mode = "velocity";
  else if (bungeeOn) mode = "bungeecord";

  return {
    supported: engineSupported(type),
    mode,
    onlineMode: props["online-mode"] !== "false",
    preventProxyConnections: props["prevent-proxy-connections"] === "true",
    velocitySecret:
      typeof byId["paper-velocity-secret"]?.value === "string"
        ? String(byId["paper-velocity-secret"].value)
        : "",
    checklist: [
      {
        id: "online-mode-off",
        label: "online-mode=false on the backend",
        ok: props["online-mode"] === "false",
      },
      {
        id: "forwarding",
        label:
          mode === "velocity"
            ? "Velocity modern forwarding enabled"
            : mode === "bungeecord"
              ? "BungeeCord mode enabled"
              : "Choose Velocity or BungeeCord",
        ok: mode !== "none",
      },
      {
        id: "secret",
        label: "Velocity secret set (Velocity only)",
        ok:
          mode !== "velocity" ||
          Boolean(
            typeof byId["paper-velocity-secret"]?.value === "string" &&
              String(byId["paper-velocity-secret"].value).trim(),
          ),
      },
    ],
  };
}

export async function applyProxySetup(
  serverId: string,
  type: ServerType,
  mode: ProxyMode,
): Promise<Awaited<ReturnType<typeof getProxySetup>>> {
  if (!engineSupported(type) && mode !== "none") {
    throw new Error("Proxy helpers are only available for Paper and Purpur");
  }

  if (mode === "none") {
    await updateServerProperties(serverId, {
      "online-mode": "true",
      "prevent-proxy-connections": "true",
    });
    if (engineSupported(type)) {
      await updateEngineSettings(serverId, type, {
        "spigot-bungeecord": false,
        "paper-velocity-enabled": false,
      });
    }
    return getProxySetup(serverId, type);
  }

  await updateServerProperties(serverId, {
    "online-mode": "false",
    "prevent-proxy-connections": "false",
  });

  if (mode === "bungeecord") {
    await updateEngineSettings(serverId, type, {
      "spigot-bungeecord": true,
      "paper-velocity-enabled": false,
    });
  } else {
    const current = await getProxySetup(serverId, type);
    const secret =
      current.velocitySecret.trim() || randomBytes(32).toString("hex");
    await updateEngineSettings(serverId, type, {
      "spigot-bungeecord": false,
      "paper-velocity-enabled": true,
      "paper-velocity-secret": secret,
    });
  }

  return getProxySetup(serverId, type);
}
