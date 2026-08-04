import { createBot, type Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import type { BotCommandRequest, BotInfo } from "@msm/shared";
import { parseBotAiPrompt } from "./bot-ai.js";
import { resolveBotClientVersion } from "./bot-compat.js";
import { clearSurvivalBusy, handleSurvivalTick } from "./bot-survival.js";
import {
  clearTimers,
  ensurePathfinder,
  isLogLikeName,
  releaseChopClaims,
  sleep,
  startChaseAttack,
  startContinuousChop,
  startGoto,
  startSmoothFollow,
  type ManagedBot,
} from "./bot-movement/index.js";
import { processManager } from "./process-manager.js";

const { goals } = pathfinderPkg;
const { GoalNear, GoalBlock } = goals;

const MAX_BOTS = 20;
const DEFAULT_COUNT = 10;
const DEFAULT_PREFIX = "Bot";
const SPAWN_STAGGER_MS = 400;

function toInfo(entry: ManagedBot): BotInfo {
  return {
    username: entry.username,
    status: entry.status,
    error: entry.error,
    joinedAt: entry.joinedAt,
    activity: entry.activity,
  };
}

/** Hold jump across physics ticks (a short setTimeout often gets dropped via Via*). */
function startJump(bot: Bot, entry: ManagedBot): void {
  clearTimers(entry);
  let ticks = 0;
  const holdTicks = 14; // ~0.7s — enough to leave the ground once

  const onTick = () => {
    if (entry.bot !== bot) return;
    ticks += 1;
    try {
      bot.setControlState("jump", true);
      // Help stubborn clients that ignore the control packet briefly
      if (ticks === 1 && bot.entity.onGround) {
        bot.entity.velocity.y = Math.max(bot.entity.velocity.y, 0.42);
      }
    } catch {
      // ignore
    }
    if (ticks >= holdTicks) {
      try {
        bot.setControlState("jump", false);
      } catch {
        // ignore
      }
      clearTimers(entry);
      entry.activity = "idle";
    }
  };

  entry.physicsHandler = onTick;
  bot.on("physicsTick", onTick);
  entry.activity = "jumping";
  onTick();
}

function stopMovement(bot: Bot, entry: ManagedBot): void {
  entry.taskToken += 1;
  releaseChopClaims(entry.username);
  clearTimers(entry);
  try {
    bot.pathfinder?.setGoal(null);
  } catch {
    // ignore
  }
  try {
    bot.setControlState("forward", false);
    bot.setControlState("back", false);
    bot.setControlState("left", false);
    bot.setControlState("right", false);
    bot.setControlState("sprint", false);
    bot.setControlState("jump", false);
    bot.clearControlStates();
  } catch {
    // ignore
  }
  entry.activity = "idle";
}

/** Stop any ongoing follow/wander/guard before starting a new order. */
function interruptOngoing(bot: Bot, entry: ManagedBot): void {
  entry.taskToken += 1;
  releaseChopClaims(entry.username);
  clearTimers(entry);
  clearSurvivalBusy(bot);
  try {
    bot.pathfinder?.setGoal(null);
  } catch {
    // ignore
  }
  try {
    bot.setControlState("forward", false);
    bot.setControlState("sprint", false);
    bot.setControlState("jump", false);
    bot.setControlState("left", false);
    bot.setControlState("right", false);
  } catch {
    // ignore
  }
}

class BotManager {
  private servers = new Map<string, Map<string, ManagedBot>>();

  constructor() {
    // Forked worker receives status via IPC (see bot-manager-proxy); skip
    // the in-process processManager subscription there.
    if (process.env.GUARTRIX_IS_BOT_WORKER === "1") return;
    processManager.on("status", (serverId: string, status: string) => {
      this.handleServerStatus(serverId, status);
    });
  }

  /** Stop bots when the MC server leaves RUNNING (panel or worker IPC). */
  handleServerStatus(serverId: string, status: string): void {
    if (status === "STOPPED" || status === "STOPPING" || status === "ERROR") {
      void this.stopBots(serverId);
    }
  }

  listBots(serverId: string): BotInfo[] {
    const map = this.servers.get(serverId);
    if (!map) return [];
    return [...map.values()].map(toInfo);
  }

  private getOrCreateMap(serverId: string): Map<string, ManagedBot> {
    let map = this.servers.get(serverId);
    if (!map) {
      map = new Map();
      this.servers.set(serverId, map);
    }
    return map;
  }

  async spawnBots(
    serverId: string,
    opts: {
      port: number;
      mcVersion: string;
      count?: number;
      prefix?: string;
      host?: string;
    },
  ): Promise<BotInfo[]> {
    const count = Math.min(
      MAX_BOTS,
      Math.max(1, Math.floor(opts.count ?? DEFAULT_COUNT)),
    );
    const prefix = (opts.prefix?.trim() || DEFAULT_PREFIX).replace(
      /[^a-zA-Z0-9_]/g,
      "",
    );
    if (!prefix || prefix.length > 12) {
      throw new Error("Invalid bot name prefix");
    }

    const map = this.getOrCreateMap(serverId);
    for (const [name, entry] of [...map.entries()]) {
      if (entry.status === "error" || entry.status === "disconnected") {
        clearTimers(entry);
        try {
          entry.bot?.end();
        } catch {
          // ignore
        }
        map.delete(name);
      }
    }
    const host = opts.host ?? "127.0.0.1";
    const { clientVersion } = resolveBotClientVersion(opts.mcVersion);
    const spawned: string[] = [];

    // Register every bot as "connecting" immediately so the UI can list them live
    for (let i = 1; i <= count; i++) {
      if (map.size >= MAX_BOTS) break;

      let username = `${prefix}${i}`;
      let n = i;
      while (map.has(username) && n < MAX_BOTS * 2) {
        n += 1;
        username = `${prefix}${n}`;
      }
      if (map.has(username)) continue;
      if (username.length > 16) {
        throw new Error(`Bot username too long: ${username}`);
      }

      const entry: ManagedBot = {
        username,
        bot: null,
        status: "connecting",
        error: null,
        joinedAt: null,
        activity: null,
        wanderTimer: null,
        guardTimer: null,
        physicsHandler: null,
        taskToken: 0,
      };
      map.set(username, entry);
      spawned.push(username);
    }

    // Connect in background (staggered) — do not block the HTTP response
    const toConnect = spawned
      .map((name) => map.get(name)!)
      .filter((e) => e.status === "connecting" && !e.bot);
    void (async () => {
      for (let i = 0; i < toConnect.length; i++) {
        const entry = toConnect[i]!;
        if (!map.has(entry.username)) continue;
        this.connectBot(serverId, entry, {
          host,
          port: opts.port,
          version: clientVersion,
        });
        if (i < toConnect.length - 1) await sleep(SPAWN_STAGGER_MS);
      }
    })();

    return spawned.map((name) => toInfo(map.get(name)!));
  }

  private connectBot(
    serverId: string,
    entry: ManagedBot,
    opts: { host: string; port: number; version: string },
  ): void {
    let bot: Bot;
    try {
      bot = createBot({
        host: opts.host,
        port: opts.port,
        username: entry.username,
        auth: "offline",
        version: opts.version,
        hideErrors: true,
        checkTimeoutInterval: 60_000,
        viewDistance: "tiny",
      });
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : String(err);
      return;
    }

    entry.bot = bot;

    bot.once("spawn", () => {
      entry.status = "online";
      entry.error = null;
      entry.joinedAt = new Date().toISOString();
      entry.activity = "idle";
      try {
        bot.settings.viewDistance = "tiny";
        ensurePathfinder(bot);
        bot.clearControlStates();
      } catch {
        // pathfinder may fail on odd versions — commands will surface errors
      }
    });

    bot.on("kicked", (reason) => {
      clearTimers(entry);
      entry.status = "error";
      entry.activity = null;
      entry.error =
        typeof reason === "string"
          ? reason
          : (() => {
              try {
                return JSON.stringify(reason);
              } catch {
                return "Kicked from server";
              }
            })();
      entry.bot = null;
    });

    bot.on("error", (err) => {
      entry.status = "error";
      entry.error = err.message || String(err);
    });

    bot.on("end", (reason) => {
      clearTimers(entry);
      if (entry.status !== "error") {
        entry.status = "disconnected";
        entry.error = reason || "Disconnected";
      }
      entry.activity = null;
      entry.bot = null;
      void serverId;
    });
  }

  async stopBot(serverId: string, username: string): Promise<void> {
    const map = this.servers.get(serverId);
    const entry = map?.get(username);
    if (!entry) return;
    clearTimers(entry);
    try {
      entry.bot?.quit("Stopped by Guartrix");
    } catch {
      try {
        entry.bot?.end("Stopped by Guartrix");
      } catch {
        // ignore
      }
    }
    entry.bot = null;
    entry.status = "disconnected";
    entry.activity = null;
    map?.delete(username);
  }

  async stopBots(serverId: string): Promise<void> {
    const map = this.servers.get(serverId);
    if (!map) return;
    const names = [...map.keys()];
    await Promise.all(names.map((name) => this.stopBot(serverId, name)));
    this.servers.delete(serverId);
  }

  async stopAll(): Promise<void> {
    const ids = [...this.servers.keys()];
    await Promise.all(ids.map((id) => this.stopBots(id)));
  }

  async runCommandOnAll(
    serverId: string,
    command: BotCommandRequest,
  ): Promise<BotInfo[]> {
    const map = this.servers.get(serverId);
    if (!map) return [];
    const online = [...map.values()].filter((e) => e.status === "online");
    // Apply in background so the UI can poll live per-bot activity
    void (async () => {
      const isChop =
        command.type === "chop" ||
        (command.type === "collect" && isLogLikeName(command.item ?? "")) ||
        (command.type === "ai" &&
          /^(chop|hak|kappen)\b/i.test(command.prompt.trim()));
      const stagger = isChop ? 450 : 120;
      for (let i = 0; i < online.length; i++) {
        const entry = online[i]!;
        if (i > 0) await sleep(stagger);
        try {
          await this.runCommand(serverId, entry.username, command);
        } catch {
          // per-bot errors stay on entry.error / activity via list poll
        }
      }
    })();
    return online.map(toInfo);
  }

  async runCommand(
    serverId: string,
    username: string,
    command: BotCommandRequest,
  ): Promise<BotInfo> {
    const entry = this.servers.get(serverId)?.get(username);
    if (!entry) throw new Error("Bot not found");
    const bot = entry.bot;
    if (!bot || entry.status !== "online") {
      throw new Error("Bot is not online");
    }

    const resolved =
      command.type === "ai" ? parseBotAiPrompt(command.prompt) : command;

    // Always cancel follow/wander/guard loops before a new order
    // (otherwise jump/say/etc. get overridden every physics tick)
    if (resolved.type !== "ai") {
      interruptOngoing(bot, entry);
    }

    switch (resolved.type) {
      case "ai":
        // shouldn't recurse if parse returns ai — parse never returns ai
        throw new Error("AI prompt could not be resolved");

      case "say": {
        const text = resolved.text.trim();
        if (!text) throw new Error("Message is empty");
        if (text.length > 256) throw new Error("Message too long");
        bot.chat(text);
        entry.activity = `say: ${text.slice(0, 40)}`;
        break;
      }

      case "look": {
        await bot.look(resolved.yaw, resolved.pitch, true);
        entry.activity = "looking";
        break;
      }

      case "quit": {
        await this.stopBot(serverId, username);
        return {
          username,
          status: "disconnected",
          error: null,
          joinedAt: entry.joinedAt,
          activity: null,
        };
      }

      case "stop": {
        ensurePathfinder(bot);
        stopMovement(bot, entry);
        break;
      }

      case "jump": {
        ensurePathfinder(bot);
        try {
          bot.pathfinder.setGoal(null);
        } catch {
          // ignore
        }
        try {
          bot.setControlState("forward", false);
          bot.setControlState("back", false);
          bot.setControlState("left", false);
          bot.setControlState("right", false);
          bot.setControlState("sprint", false);
          bot.setControlState("sneak", false);
        } catch {
          // ignore
        }
        startJump(bot, entry);
        break;
      }

      case "goto": {
        if (resolved.player?.trim()) {
          const name = resolved.player.trim();
          const entity = Object.values(bot.entities).find(
            (e) =>
              e.type === "player" &&
              e.username?.toLowerCase() === name.toLowerCase(),
          );
          if (!entity) {
            throw new Error(
              `Player not found nearby: ${name}. Stand close enough that bots can see you.`,
            );
          }
          startGoto(
            bot,
            entry,
            entity.position.x,
            entity.position.y,
            entity.position.z,
          );
          entry.activity = `goto ${name}`;
          break;
        }
        if (
          resolved.x == null ||
          resolved.y == null ||
          resolved.z == null ||
          Number.isNaN(resolved.x) ||
          Number.isNaN(resolved.y) ||
          Number.isNaN(resolved.z)
        ) {
          throw new Error("goto needs a player or x y z coordinates");
        }
        startGoto(bot, entry, resolved.x, resolved.y, resolved.z);
        break;
      }

      case "follow": {
        ensurePathfinder(bot);
        const findPlayer = () =>
          Object.values(bot.entities).find(
            (e) =>
              e.type === "player" &&
              e.username?.toLowerCase() === resolved.player.toLowerCase(),
          ) ?? null;

        const target = findPlayer();
        if (!target) {
          throw new Error(
            `Player not found nearby: ${resolved.player}. They must be in loaded chunks near the bot.`,
          );
        }
        startSmoothFollow(bot, entry, findPlayer, 2.2 + Math.random() * 1.2);
        entry.activity = `following ${resolved.player} (run)`;
        break;
      }

      case "attack": {
        ensurePathfinder(bot);
        const findPlayer = resolved.player
          ? () =>
              Object.values(bot.entities).find(
                (e) =>
                  e.type === "player" &&
                  e.username?.toLowerCase() === resolved.player!.toLowerCase(),
              ) ?? null
          : () =>
              Object.values(bot.entities)
                .filter(
                  (e) =>
                    e !== bot.entity &&
                    e.position &&
                    e.position.distanceTo(bot.entity.position) < 24 &&
                    (e.type === "hostile" ||
                      e.type === "mob" ||
                      e.kind === "Hostile mobs"),
                )
                .sort(
                  (a, b) =>
                    a.position.distanceTo(bot.entity.position) -
                    b.position.distanceTo(bot.entity.position),
                )[0] ?? null;

        const target = findPlayer();
        if (!target) {
          throw new Error(
            resolved.player
              ? `Player not found nearby: ${resolved.player}. Stand close enough that bots can see you.`
              : "No nearby mob to attack",
          );
        }
        const label = resolved.player ?? "mob";
        startChaseAttack(bot, entry, findPlayer, label);
        entry.activity = `chasing ${label}`;
        break;
      }

      case "chop": {
        ensurePathfinder(bot);
        const block = (resolved.block ?? "birch_log").trim();
        startContinuousChop(bot, entry, block);
        break;
      }

      case "collect": {
        ensurePathfinder(bot);
        const want = (resolved.item ?? "").toLowerCase();
        // Log/wood → continuous chop with tree claims (not a short dig batch)
        if (isLogLikeName(want)) {
          startContinuousChop(bot, entry, want || "birch_log");
          break;
        }
        clearTimers(entry);
        const count = Math.min(64, Math.max(1, resolved.count ?? 16));
        // Prefer dropped items, else dig nearest matching block
        const drop = Object.values(bot.entities)
          .filter((e) => e.name === "item" && e.position)
          .sort(
            (a, b) =>
              a.position.distanceTo(bot.entity.position) -
              b.position.distanceTo(bot.entity.position),
          )[0];
        if (drop && !want) {
          bot.pathfinder.setGoal(
            new GoalNear(drop.position.x, drop.position.y, drop.position.z, 1),
          );
          entry.activity = "collecting items";
          break;
        }
        const block = bot.findBlock({
          matching: (b) => {
            if (!b?.name) return false;
            if (!want) {
              return (
                b.name.includes("log") ||
                b.name.includes("ore") ||
                b.name === "dirt" ||
                b.name === "cobblestone"
              );
            }
            return (
              b.name === want ||
              b.name.includes(want) ||
              b.name === `minecraft:${want}`
            );
          },
          maxDistance: 32,
          count: 1,
        });
        if (!block) {
          throw new Error(
            want
              ? `No nearby block matching "${want}"`
              : "No nearby collectible blocks",
          );
        }
        bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z));
        void (async () => {
          try {
            await bot.pathfinder.goto(
              new GoalNear(block.position.x, block.position.y, block.position.z, 2),
            );
            let dug = 0;
            while (dug < count && entry.bot === bot) {
              const next = bot.findBlock({
                matching: (b) =>
                  !!b?.name &&
                  (want
                    ? b.name === want || b.name.includes(want)
                    : b.name.includes("log") ||
                      b.name.includes("ore") ||
                      b.name === "dirt"),
                maxDistance: 16,
                count: 1,
              });
              if (!next) break;
              await bot.dig(next);
              dug += 1;
            }
            entry.activity = "idle";
          } catch (err) {
            entry.error = err instanceof Error ? err.message : String(err);
            entry.activity = "idle";
          }
        })();
        entry.activity = want ? `collecting ${want}` : "collecting";
        break;
      }

      case "dig": {
        ensurePathfinder(bot);
        clearTimers(entry);
        const want = (resolved.block ?? "").toLowerCase();
        let block = null as ReturnType<Bot["blockAt"]>;
        if (want) {
          block = bot.findBlock({
            matching: (b) =>
              !!b?.name && (b.name === want || b.name.includes(want)),
            maxDistance: 5,
            count: 1,
          });
        } else {
          const eye = bot.blockAtCursor(4);
          block = eye;
        }
        if (!block) throw new Error("No block to dig");
        await bot.dig(block);
        entry.activity = `dug ${block.name}`;
        break;
      }

      case "wander": {
        ensurePathfinder(bot);
        clearTimers(entry);
        let dest = bot.entity.position.offset(
          Math.floor(Math.random() * 28) - 14,
          0,
          Math.floor(Math.random() * 28) - 14,
        );
        let lastPos = bot.entity.position.clone();
        let stuck = 0;

        const pickDest = () => {
          const pos = bot.entity.position;
          dest = pos.offset(
            Math.floor(Math.random() * 28) - 14,
            0,
            Math.floor(Math.random() * 28) - 14,
          );
        };

        const onTick = () => {
          if (entry.bot !== bot) return;
          const dist = Math.hypot(
            bot.entity.position.x - dest.x,
            bot.entity.position.z - dest.z,
          );
          if (dist < 1.5) pickDest();

          const moved = bot.entity.position.distanceTo(lastPos);
          stuck = moved < 0.05 ? stuck + 1 : 0;
          lastPos = bot.entity.position.clone();

          if (
            handleSurvivalTick(bot, {
              stuckTicks: stuck,
              setActivity: (s) => {
                entry.activity = s;
              },
            })
          ) {
            return;
          }

          void bot.lookAt(dest.offset(0, 1, 0), true);
          bot.setControlState("forward", true);
          bot.setControlState("sprint", true);
          bot.setControlState("jump", stuck > 8 && stuck < 16);
          if (stuck > 40) pickDest();
        };

        entry.physicsHandler = onTick;
        bot.on("physicsTick", onTick);
        entry.wanderTimer = setInterval(pickDest, 9000);
        entry.activity = "wandering (run)";
        onTick();
        break;
      }

      case "guard": {
        ensurePathfinder(bot);
        clearTimers(entry);
        const origin = bot.entity.position.clone();
        const radius = Math.min(32, Math.max(2, resolved.radius ?? 8));
        const tick = () => {
          if (entry.bot !== bot) return;
          const mob = Object.values(bot.entities)
            .filter(
              (e) =>
                e !== bot.entity &&
                e.position &&
                e.position.distanceTo(origin) <= radius &&
                (e.type === "hostile" ||
                  e.type === "mob" ||
                  e.kind === "Hostile mobs"),
            )
            .sort(
              (a, b) =>
                a.position.distanceTo(bot.entity.position) -
                b.position.distanceTo(bot.entity.position),
            )[0];
          if (mob) {
            void bot.lookAt(mob.position.offset(0, 1, 0)).then(() =>
              bot.attack(mob),
            );
            return;
          }
          if (bot.entity.position.distanceTo(origin) > 2) {
            bot.pathfinder.setGoal(
              new GoalNear(origin.x, origin.y, origin.z, 1),
            );
          }
        };
        tick();
        entry.guardTimer = setInterval(tick, 1500);
        entry.activity = `guarding r=${radius}`;
        break;
      }

      default: {
        const _exhaustive: never = resolved;
        throw new Error(`Unknown command: ${JSON.stringify(_exhaustive)}`);
      }
    }

    return toInfo(entry);
  }
}

export const botManager = new BotManager();
export { MAX_BOTS, DEFAULT_COUNT };
