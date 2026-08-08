import type { OpEntry, PlayersResponse } from "@msm/shared";
import { bdsConsoleGamertagArg, isBdsServerType, validateBedrockGamertag } from "@msm/shared";
import { processManager } from "../process-manager.js";
import { readBans } from "./bans.js";
import {
  readBdsAllowlistEntries,
  readBdsOpsAsPanelEntries,
  readBdsPermissions,
  readJsonArray,
  resolvePlayer,
  runBdsAllowlistReload,
  runBdsPermissionReload,
  runLive,
  serverTypeFor,
  writeBdsAllowlistEntries,
  writeBdsPermissions,
  writeJsonArray,
} from "./helpers.js";

export async function readPlayers(serverId: string): Promise<PlayersResponse> {
  const serverType = await serverTypeFor(serverId);

  let whitelistRaw: { name?: string; uuid?: string }[] = [];
  if (isBdsServerType(serverType)) {
    whitelistRaw = (await readBdsAllowlistEntries(serverId)).map((e) => ({
      name: e.name,
      uuid: e.xuid ?? "",
    }));
  } else {
    whitelistRaw = await readJsonArray<{ name?: string; uuid?: string }>(
      serverId,
      "whitelist.json",
    );
  }
  const opsRaw = isBdsServerType(serverType)
    ? await readBdsOpsAsPanelEntries(serverId)
    : await readJsonArray<{
        name?: string;
        uuid?: string;
        level?: number;
        bypassesPlayerLimit?: boolean;
      }>(serverId, "ops.json");
  const bans = await readBans(serverId);

  return {
    whitelist: whitelistRaw
      .filter((e) => e.name)
      .map((e) => ({
        name: e.name!,
        uuid: e.uuid?.trim() ? e.uuid! : "bedrock",
      })),
    ops: opsRaw
      .filter((e) => e.name && e.uuid)
      .map((e) => ({
        name: e.name!,
        uuid: e.uuid!,
        level: e.level ?? 4,
        bypassesPlayerLimit: Boolean(e.bypassesPlayerLimit),
      })),
    bannedPlayers: bans.players,
  };
}

export async function addWhitelist(
  serverId: string,
  _dir: string,
  name: string,
): Promise<PlayersResponse> {
  const serverType = await serverTypeFor(serverId);

  if (isBdsServerType(serverType)) {
    const gamertag = validateBedrockGamertag(name);
    const list = await readBdsAllowlistEntries(serverId);
    if (list.some((e) => e.name.toLowerCase() === gamertag.toLowerCase())) {
      throw new Error(`${gamertag} is already on the allowlist`);
    }
    list.push({ name: gamertag, ignoresPlayerLimit: false });
    await writeBdsAllowlistEntries(serverId, list);
    runLive(serverId, `allowlist add ${bdsConsoleGamertagArg(gamertag)}`);
    runBdsAllowlistReload(serverId);
    return readPlayers(serverId);
  }

  const player = await resolvePlayer(name);
  const list = await readJsonArray<{ name: string; uuid: string }>(serverId, "whitelist.json");
  if (list.some((e) => e.name.toLowerCase() === player.name.toLowerCase())) {
    throw new Error(`${player.name} is already on the whitelist`);
  }
  list.push({ uuid: player.uuid, name: player.name });
  await writeJsonArray(serverId, "whitelist.json", list);
  runLive(serverId, `whitelist add ${player.name}`);
  return readPlayers(serverId);
}

export async function removeWhitelist(
  serverId: string,
  _dir: string,
  name: string,
): Promise<PlayersResponse> {
  const serverType = await serverTypeFor(serverId);

  if (isBdsServerType(serverType)) {
    const cleaned = validateBedrockGamertag(name);
    const list = await readBdsAllowlistEntries(serverId);
    const next = list.filter((e) => e.name.toLowerCase() !== cleaned.toLowerCase());
    if (next.length === list.length) {
      throw new Error(`${cleaned} is not on the allowlist`);
    }
    await writeBdsAllowlistEntries(serverId, next);
    runLive(serverId, `allowlist remove ${bdsConsoleGamertagArg(cleaned)}`);
    runBdsAllowlistReload(serverId);
    return readPlayers(serverId);
  }

  const list = await readJsonArray<{ name: string; uuid: string }>(serverId, "whitelist.json");
  const next = list.filter((e) => e.name.toLowerCase() !== name.toLowerCase());
  if (next.length === list.length) {
    throw new Error(`${name} is not on the whitelist`);
  }
  await writeJsonArray(serverId, "whitelist.json", next);
  runLive(serverId, `whitelist remove ${name}`);
  return readPlayers(serverId);
}

export async function addOp(
  serverId: string,
  _dir: string,
  name: string,
  level = 4,
): Promise<PlayersResponse> {
  const serverType = await serverTypeFor(serverId);

  if (isBdsServerType(serverType)) {
    const gamertag = validateBedrockGamertag(name);
    const allowlist = await readBdsAllowlistEntries(serverId);
    const entry = allowlist.find((e) => e.name.toLowerCase() === gamertag.toLowerCase());
    const xuid = entry?.xuid;
    if (xuid) {
      const perms = await readBdsPermissions(serverId);
      if (perms.some((p) => p.xuid === xuid && p.permission === "operator")) {
        throw new Error(`${gamertag} is already an operator`);
      }
      const next = perms.filter((p) => p.xuid !== xuid);
      next.push({ permission: "operator", xuid });
      await writeBdsPermissions(serverId, next);
      runBdsPermissionReload(serverId);
    }
    if (processManager.isRunning(serverId)) {
      runLive(serverId, `op ${bdsConsoleGamertagArg(gamertag)}`);
    } else if (!xuid) {
      throw new Error(
        `${gamertag} must join the server once (online mode) before they can be made operator`,
      );
    }
    return readPlayers(serverId);
  }

  const player = await resolvePlayer(name);
  const list = await readJsonArray<OpEntry>(serverId, "ops.json");
  if (list.some((e) => e.name.toLowerCase() === player.name.toLowerCase())) {
    throw new Error(`${player.name} is already an operator`);
  }
  list.push({
    uuid: player.uuid,
    name: player.name,
    level,
    bypassesPlayerLimit: false,
  });
  await writeJsonArray(serverId, "ops.json", list);
  runLive(serverId, `op ${player.name}`);
  return readPlayers(serverId);
}

export async function removeOp(
  serverId: string,
  _dir: string,
  name: string,
): Promise<PlayersResponse> {
  const serverType = await serverTypeFor(serverId);

  if (isBdsServerType(serverType)) {
    const cleaned = name.trim();
    const allowlist = await readBdsAllowlistEntries(serverId);
    const entry = allowlist.find(
      (e) =>
        e.name.toLowerCase() === cleaned.toLowerCase() ||
        e.xuid === cleaned ||
        cleaned === `xuid:${e.xuid}`,
    );
    const xuid = entry?.xuid ?? (cleaned.startsWith("xuid:") ? cleaned.slice(5) : "");
    if (xuid) {
      const perms = await readBdsPermissions(serverId);
      const next = perms.filter((p) => p.xuid !== xuid);
      if (next.length === perms.length) {
        throw new Error(`${cleaned} is not an operator`);
      }
      await writeBdsPermissions(serverId, next);
      runBdsPermissionReload(serverId);
    }
    const gamertag = entry?.name ?? cleaned.replace(/^xuid:/, "");
    if (processManager.isRunning(serverId) && gamertag && !gamertag.startsWith("xuid:")) {
      runLive(serverId, `deop ${bdsConsoleGamertagArg(gamertag)}`);
    } else if (!xuid) {
      throw new Error(`${cleaned} is not an operator`);
    }
    return readPlayers(serverId);
  }

  const list = await readJsonArray<OpEntry>(serverId, "ops.json");
  const next = list.filter((e) => e.name.toLowerCase() !== name.toLowerCase());
  if (next.length === list.length) {
    throw new Error(`${name} is not an operator`);
  }
  await writeJsonArray(serverId, "ops.json", next);
  runLive(serverId, `deop ${name}`);
  return readPlayers(serverId);
}
