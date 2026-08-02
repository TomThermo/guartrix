import { createBot, type Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import type { BotCommandRequest, BotInfo, BotStatus } from "@msm/shared";
import { Vec3 } from "vec3";
import { parseBotAiPrompt } from "./bot-ai.js";
import { resolveBotClientVersion } from "./bot-compat.js";
import {
  clearPathToward,
  clearSurvivalBusy,
  handleSurvivalTick,
  scaffoldToward,
} from "./bot-survival.js";
import { processManager } from "./process-manager.js";

const { pathfinder, Movements, goals } = pathfinderPkg;
const { GoalNear, GoalBlock, GoalFollow } = goals;

const MAX_BOTS = 20;
const DEFAULT_COUNT = 10;
const DEFAULT_PREFIX = "Bot";
const SPAWN_STAGGER_MS = 400;

interface ManagedBot {
  username: string;
  bot: Bot | null;
  status: BotStatus;
  error: string | null;
  joinedAt: string | null;
  activity: string | null;
  wanderTimer: ReturnType<typeof setInterval> | null;
  guardTimer: ReturnType<typeof setInterval> | null;
  physicsHandler: (() => void) | null;
  /** Bumped to cancel async loops (chop, etc.). */
  taskToken: number;
}

/** Shared tree claims (by XZ) so bots don't all dig the same tree. */
const chopClaims = new Map<string, { owner: string; until: number }>();

function blockKey(x: number, y: number, z: number): string {
  return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

function treeKey(x: number, z: number): string {
  return `tree:${Math.floor(x)},${Math.floor(z)}`;
}

function purgeChopClaims(): void {
  const now = Date.now();
  for (const [k, v] of chopClaims) {
    if (v.until < now) chopClaims.delete(k);
  }
}

function releaseChopClaims(owner: string): void {
  for (const [k, v] of chopClaims) {
    if (v.owner === owner) chopClaims.delete(k);
  }
}

/** True if another bot owns a tree within `radius` blocks on XZ. */
function isTreeTakenByOther(owner: string, x: number, z: number, radius = 4): boolean {
  purgeChopClaims();
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  for (const [k, v] of chopClaims) {
    if (!k.startsWith("tree:")) continue;
    if (v.owner === owner || v.until < Date.now()) continue;
    const parts = k.slice(5).split(",");
    const tx = Number(parts[0]);
    const tz = Number(parts[1]);
    if (Math.hypot(tx - fx, tz - fz) <= radius) return true;
  }
  return false;
}

function tryClaimTree(owner: string, x: number, z: number): boolean {
  if (isTreeTakenByOther(owner, x, z, 4)) return false;
  chopClaims.set(treeKey(x, z), { owner, until: Date.now() + 180_000 });
  return true;
}

function normalizeBlockWant(want: string): string {
  return want.replace(/^minecraft:/, "").toLowerCase().trim();
}

/** Only trunk wood — never leaves/saplings/etc. */
function isChopTrunkName(blockName: string): boolean {
  const n = blockName.replace(/^minecraft:/, "").toLowerCase();
  if (!n) return false;
  if (n.includes("leaves") || n.includes("leaf") || n.includes("sapling")) {
    return false;
  }
  // Real logs / stems / hyphae / "wood" (bark block), not planks
  if (n.includes("_log") || n.endsWith("log")) return true;
  if (n.includes("_stem") || n.endsWith("stem")) return true;
  if (n.includes("_hyphae") || n.endsWith("hyphae")) return true;
  if (n.endsWith("_wood") || n === "wood") return true;
  return false;
}

function woodSpecies(want: string): string | null {
  const w = normalizeBlockWant(want);
  if (!w) return null;
  return w
    .replace(/^stripped_/, "")
    .replace(/_log$/, "")
    .replace(/_wood$/, "")
    .replace(/_stem$/, "")
    .replace(/_hyphae$/, "")
    .replace(/_planks$/, "")
    .replace(/_leaves$/, "");
}

function blockMatchesWant(blockName: string, want: string): boolean {
  const n = blockName.replace(/^minecraft:/, "").toLowerCase();
  // Hard rule: never chop leaves
  if (!isChopTrunkName(n)) return false;

  if (!want) return true;

  const w = normalizeBlockWant(want);
  if (n === w) return true;
  if (n === `stripped_${w}`) return true;
  if (w.startsWith("stripped_") && n === w) return true;

  const species = woodSpecies(w);
  if (!species) return n.includes("log") || n.includes("stem");

  // birch_log / birch → birch_log, stripped_birch_log, birch_wood — NOT birch_leaves
  return (
    n === `${species}_log` ||
    n === `stripped_${species}_log` ||
    n === `${species}_wood` ||
    n === `stripped_${species}_wood` ||
    n === `${species}_stem` ||
    n === `stripped_${species}_stem` ||
    n === `${species}_hyphae` ||
    n === `stripped_${species}_hyphae`
  );
}

function isLogLikeName(name: string): boolean {
  const n = normalizeBlockWant(name);
  if (!n) return true;
  if (n.includes("leaves") || n.includes("leaf")) return false;
  return (
    n.includes("log") ||
    n.includes("stem") ||
    n.includes("wood") ||
    n === "birch" ||
    n === "oak" ||
    n === "spruce" ||
    n === "jungle" ||
    n === "acacia" ||
    n === "dark_oak" ||
    n === "mangrove" ||
    n === "cherry" ||
    n === "crimson" ||
    n === "warped"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toInfo(entry: ManagedBot): BotInfo {
  return {
    username: entry.username,
    status: entry.status,
    error: entry.error,
    joinedAt: entry.joinedAt,
    activity: entry.activity,
  };
}

function clearTimers(entry: ManagedBot): void {
  if (entry.wanderTimer) {
    clearInterval(entry.wanderTimer);
    entry.wanderTimer = null;
  }
  if (entry.guardTimer) {
    clearInterval(entry.guardTimer);
    entry.guardTimer = null;
  }
  if (entry.physicsHandler && entry.bot) {
    try {
      entry.bot.removeListener("physicsTick", entry.physicsHandler);
    } catch {
      // ignore
    }
    entry.physicsHandler = null;
  }
}

/** At most this many bots may recompute an A* path at the same time. */
let pathSlotsInUse = 0;
const MAX_PATH_SLOTS = 3;

function tryAcquirePathSlot(): boolean {
  if (pathSlotsInUse >= MAX_PATH_SLOTS) return false;
  pathSlotsInUse += 1;
  return true;
}

function releasePathSlot(): void {
  pathSlotsInUse = Math.max(0, pathSlotsInUse - 1);
}

function ensurePathfinder(bot: Bot): void {
  if (!bot.hasPlugin(pathfinder)) {
    bot.loadPlugin(pathfinder);
  }
  const movements = new Movements(bot);
  // NEVER dig while pathing — bots dig holes under themselves / ceilings and get stuck
  movements.canDig = false;
  movements.allowSprinting = true;
  movements.allowParkour = true;
  movements.allowFreeMotion = false;
  movements.allow1by1towers = false;
  movements.maxDropDown = 1;
  try {
    (movements as { liquidCost?: number }).liquidCost = 3;
  } catch {
    // ignore
  }
  // Don't break anything near the bot's feet/head as a fallback
  try {
    movements.exclusionAreasBreak = [
      (block) => {
        const by = block.position.y;
        const ey = Math.floor(bot.entity.position.y);
        // Infinite cost for digging floor under / at feet, or ceiling on head
        if (by <= ey) return 100;
        if (by >= ey + 2) return 100;
        return 0;
      },
    ];
  } catch {
    // ignore
  }
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.thinkTimeout = 35;
  bot.pathfinder.tickTimeout = 8;
}

type FollowTarget = {
  position: {
    x: number;
    y: number;
    z: number;
    offset: (
      x: number,
      y: number,
      z: number,
    ) => { x: number; y: number; z: number };
  };
  id?: number;
  username?: string;
};

/** Look at blocks ahead: step-up (1 high) vs tall obstacle (tree/wall). */
function obstacleAhead(bot: Bot): {
  stepUp: boolean;
  tall: boolean;
  clear: boolean;
} {
  const yaw = bot.entity.yaw;
  const dx = -Math.sin(yaw);
  const dz = -Math.cos(yaw);
  const p = bot.entity.position;
  const body = bot.blockAt(p.offset(dx * 0.9, 0.15, dz * 0.9));
  const head = bot.blockAt(p.offset(dx * 0.9, 1.4, dz * 0.9));
  const bodySolid = !!body && body.boundingBox === "block";
  const headSolid = !!head && head.boundingBox === "block";
  return {
    stepUp: bodySolid && !headSolid,
    tall: bodySolid && headSolid,
    clear: !bodySolid && !headSolid,
  };
}

/** Cheap: solid block right in front at body/head? */
function blockedAhead(bot: Bot): boolean {
  const o = obstacleAhead(bot);
  return o.stepUp || o.tall;
}

/**
 * Fast follow for many bots: sprint by default.
 * Pathfinder only when stuck/blocked (A* is expensive ×20).
 */
function startSmoothFollow(
  bot: Bot,
  entry: ManagedBot,
  findTarget: () => FollowTarget | null,
  range = 2.5,
): void {
  clearTimers(entry);
  ensurePathfinder(bot);
  try {
    bot.pathfinder.setGoal(null);
  } catch {
    // ignore
  }

  let lastPos = bot.entity.position.clone();
  let stuckTicks = 0;
  let tick = 0;
  let lastPathAt = 0;
  let usingPath = false;
  let strafeDir: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
  const tickOffset = Math.floor(Math.random() * 8); // desync bots

  const clearPath = () => {
    if (!usingPath) return;
    usingPath = false;
    try {
      bot.pathfinder.setGoal(null);
    } catch {
      // ignore
    }
  };

  const requestPath = (target: FollowTarget) => {
    const now = Date.now();
    if (now - lastPathAt < 900) return;
    if (!tryAcquirePathSlot()) return;
    lastPathAt = now;
    usingPath = true;
    try {
      const entity =
        target.id != null
          ? Object.values(bot.entities).find((e) => e.id === target.id)
          : null;
      if (entity) {
        bot.pathfinder.setGoal(new GoalFollow(entity, range), true);
      } else {
        bot.pathfinder.setGoal(
          new GoalNear(
            target.position.x,
            target.position.y,
            target.position.z,
            range,
          ),
          true,
        );
      }
    } catch {
      usingPath = false;
    } finally {
      setTimeout(releasePathSlot, 50);
    }
  };

  const onTick = () => {
    if (entry.bot !== bot) return;
    tick += 1;

    const doHeavy = (tick + tickOffset) % 2 === 0;

    const target = findTarget();
    if (!target) {
      clearPath();
      bot.setControlState("forward", false);
      bot.setControlState("sprint", false);
      bot.setControlState("jump", false);
      bot.setControlState("left", false);
      bot.setControlState("right", false);
      entry.activity = "follow lost";
      return;
    }

    const dist = bot.entity.position.distanceTo(target.position as never);
    const moved = bot.entity.position.distanceTo(lastPos);
    if (moved < 0.05 && dist > range + 0.4) stuckTicks += 1;
    else stuckTicks = 0;
    lastPos = bot.entity.position.clone();

    if (doHeavy) {
      if (
        handleSurvivalTick(bot, {
          stuckTicks,
          mode: "navigate",
          setActivity: (s) => {
            entry.activity = s;
          },
        })
      ) {
        clearPath();
        return;
      }
    }

    if (dist <= range) {
      clearPath();
      bot.setControlState("forward", false);
      bot.setControlState("sprint", false);
      bot.setControlState("jump", false);
      bot.setControlState("left", false);
      bot.setControlState("right", false);
      if (doHeavy) {
        void bot.lookAt(target.position.offset(0, 1.6, 0) as never, true);
      }
      entry.activity = `following ${target.username ?? "player"}`;
      return;
    }

    const blocked = doHeavy && blockedAhead(bot);
    const needPath = stuckTicks > 12 || blocked;

    if (needPath) {
      requestPath(target);
      bot.setControlState("sprint", true);
      entry.activity = `following ${target.username ?? "player"} (path)`;
      const pathLen = (bot.pathfinder as { path?: unknown[] }).path?.length ?? 0;
      if (pathLen === 0) {
        const obs = obstacleAhead(bot);
        if (stuckTicks > 0 && stuckTicks % 16 === 0) {
          strafeDir = strafeDir === "left" ? "right" : "left";
        }
        if (obs.tall) {
          // Tree/wall — walk around, do NOT jump into it
          bot.setControlState("forward", false);
          bot.setControlState("jump", false);
          bot.setControlState("left", strafeDir === "left");
          bot.setControlState("right", strafeDir === "right");
          // Turn slightly away from the obstacle
          void bot.look(
            bot.entity.yaw + (strafeDir === "left" ? 0.6 : -0.6),
            bot.entity.pitch,
            true,
          );
        } else {
          void bot.lookAt(target.position.offset(0, 1, 0) as never, true);
          bot.setControlState("forward", true);
          bot.setControlState("jump", obs.stepUp); // only 1-block step
          bot.setControlState("left", obs.stepUp === false && strafeDir === "left");
          bot.setControlState("right", obs.stepUp === false && strafeDir === "right");
        }
      } else {
        bot.setControlState("left", false);
        bot.setControlState("right", false);
        bot.setControlState("jump", false);
      }
      return;
    }

    clearPath();
    bot.setControlState("left", false);
    bot.setControlState("right", false);
    void bot.lookAt(target.position.offset(0, 1, 0) as never, true);
    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    bot.setControlState("jump", false);
    entry.activity = `following ${target.username ?? "player"}`;
  };

  entry.physicsHandler = onTick;
  bot.on("physicsTick", onTick);
  onTick();
}

/** Pathfind to coords — walk around trees via detours when stuck. */
function startGoto(
  bot: Bot,
  entry: ManagedBot,
  x: number,
  y: number,
  z: number,
): void {
  clearTimers(entry);
  clearSurvivalBusy(bot);
  ensurePathfinder(bot);
  bot.pathfinder.thinkTimeout = 120;
  bot.pathfinder.tickTimeout = 25;
  try {
    bot.pathfinder.setGoal(null);
  } catch {
    // ignore
  }

  const label = `${Math.round(x)} ${Math.round(y)} ${Math.round(z)}`;
  let lastPos = bot.entity.position.clone();
  let stuckTicks = 0;
  let tick = 0;
  let lastPathAt = 0;
  let strafeDir: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
  let detourPhase = 0; // 0 = goal, 1 = side waypoint
  const tickOffset = Math.floor(Math.random() * 8);

  const setPath = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPathAt < 500) return;
    if (!tryAcquirePathSlot()) return;
    lastPathAt = now;

    let gx = x;
    let gy = y;
    let gz = z;

    // When stuck: path to a side waypoint first so A* goes AROUND the obstacle
    if (stuckTicks > 10 || detourPhase === 1) {
      detourPhase = 1;
      const bx = bot.entity.position.x;
      const bz = bot.entity.position.z;
      const toGoalX = x - bx;
      const toGoalZ = z - bz;
      const len = Math.hypot(toGoalX, toGoalZ) || 1;
      const side = strafeDir === "left" ? 1 : -1;
      // Perpendicular offset 5–8 blocks
      const ox = (-toGoalZ / len) * side * (5 + Math.min(4, stuckTicks / 10));
      const oz = (toGoalX / len) * side * (5 + Math.min(4, stuckTicks / 10));
      gx = bx + ox + toGoalX * 0.25;
      gz = bz + oz + toGoalZ * 0.25;
      gy = bot.entity.position.y;
      entry.activity = `goto ${label} (around)`;
    } else {
      entry.activity = `goto ${label}`;
    }

    try {
      bot.pathfinder.setGoal(new GoalNear(gx, gy, gz, detourPhase === 1 ? 2 : 1.5), true);
    } finally {
      setTimeout(releasePathSlot, 60);
    }
  };

  setPath(true);

  const onTick = () => {
    if (entry.bot !== bot) return;
    tick += 1;
    const doHeavy = (tick + tickOffset) % 2 === 0;

    const dist = Math.hypot(
      bot.entity.position.x - x,
      bot.entity.position.y - y,
      bot.entity.position.z - z,
    );
    const moved = bot.entity.position.distanceTo(lastPos);
    if (moved < 0.04 && dist > 2) stuckTicks += 1;
    else {
      if (moved > 0.08) stuckTicks = Math.max(0, stuckTicks - 2);
      else stuckTicks = 0;
    }
    lastPos = bot.entity.position.clone();

    // Water only — don't enter "escaping…" against trees
    if (
      doHeavy &&
      handleSurvivalTick(bot, {
        stuckTicks,
        mode: "navigate",
        setActivity: (s) => {
          entry.activity = s;
        },
      })
    ) {
      return;
    }

    if (dist <= 1.8) {
      try {
        bot.pathfinder.setGoal(null);
      } catch {
        // ignore
      }
      bot.clearControlStates();
      entry.activity = `arrived ${label}`;
      clearTimers(entry);
      return;
    }

    // Finished detour waypoint → go to real goal
    if (detourPhase === 1) {
      const pathLen = (bot.pathfinder as { path?: unknown[] }).path?.length ?? 0;
      if (pathLen === 0 && stuckTicks < 5) {
        detourPhase = 0;
        setPath(true);
      }
    }

    if (!bot.pathfinder.goal || stuckTicks > 8) {
      if (stuckTicks > 20 && stuckTicks % 25 === 0) {
        strafeDir = strafeDir === "left" ? "right" : "left";
        detourPhase = 1;
      }
      setPath(stuckTicks > 8);
    }

    if (detourPhase === 0) entry.activity = `goto ${label}`;

    const pathLen = (bot.pathfinder as { path?: unknown[] }).path?.length ?? 0;
    const obs = doHeavy
      ? obstacleAhead(bot)
      : { stepUp: false, tall: false, clear: true };

    if (pathLen > 0) {
      bot.setControlState("sprint", true);
      bot.setControlState("left", false);
      bot.setControlState("right", false);
      bot.setControlState("jump", obs.stepUp);
      bot.setControlState("forward", false); // let pathfinder drive
      return;
    }

    // No path: actively walk around tall obstacles
    if (stuckTicks > 0 && stuckTicks % 12 === 0) {
      strafeDir = strafeDir === "left" ? "right" : "left";
      detourPhase = 1;
      setPath(true);
    }

    if (obs.tall || stuckTicks > 6) {
      bot.setControlState("forward", stuckTicks < 8);
      bot.setControlState("sprint", false);
      bot.setControlState("jump", obs.stepUp);
      bot.setControlState("left", strafeDir === "left");
      bot.setControlState("right", strafeDir === "right");
      void bot.look(
        bot.entity.yaw + (strafeDir === "left" ? 0.9 : -0.9),
        0,
        true,
      );
      return;
    }

    void bot.lookAt(
      bot.entity.position.offset(
        x - bot.entity.position.x,
        1,
        z - bot.entity.position.z,
      ),
      true,
    );
    bot.setControlState("sprint", true);
    bot.setControlState("forward", true);
    bot.setControlState("jump", obs.stepUp);
    bot.setControlState("left", false);
    bot.setControlState("right", false);
  };

  entry.physicsHandler = onTick;
  bot.on("physicsTick", onTick);
  onTick();
}

/**
 * Chase a target and keep hitting them (not a one-shot swing).
 */
function startChaseAttack(
  bot: Bot,
  entry: ManagedBot,
  findTarget: () => {
    position: { x: number; y: number; z: number };
    height?: number;
    id?: number;
  } | null,
  label: string,
): void {
  clearTimers(entry);
  try {
    bot.pathfinder.setGoal(null);
  } catch {
    // ignore
  }

  const meleeRange = 3.4;
  let lastPos = bot.entity.position.clone();
  let stuckTicks = 0;
  let usingPath = false;
  let hits = 0;

  const resolveEntity = () => {
    const target = findTarget();
    if (!target) return null;
    return (
      Object.values(bot.entities).find((e) => e.id === target.id) ??
      Object.values(bot.entities).find(
        (e) =>
          e.position &&
          Math.hypot(
            e.position.x - target.position.x,
            e.position.y - target.position.y,
            e.position.z - target.position.z,
          ) < 1.25,
      ) ??
      null
    );
  };

  const swing = () => {
    if (entry.bot !== bot) return;
    const entity = resolveEntity();
    if (!entity) return;
    const dist = bot.entity.position.distanceTo(entity.position);
    if (dist > meleeRange + 0.6) return;
    try {
      void bot.lookAt(entity.position.offset(0, (entity.height ?? 1.6) * 0.7, 0), true);
      bot.swingArm("right", true);
      bot.attack(entity);
      hits += 1;
      entry.activity = `attacking ${label} ×${hits}`;
    } catch {
      // ignore
    }
  };

  const onTick = () => {
    if (entry.bot !== bot) return;
    const target = findTarget();
    if (!target) {
      bot.setControlState("forward", false);
      bot.setControlState("sprint", false);
      bot.setControlState("jump", false);
      entry.activity = `attack lost ${label}`;
      return;
    }

    const lookY = target.position.y + (target.height ?? 1.6) * 0.7;
    const dist = Math.hypot(
      bot.entity.position.x - target.position.x,
      bot.entity.position.y - target.position.y,
      bot.entity.position.z - target.position.z,
    );
    const moved = bot.entity.position.distanceTo(lastPos);
    if (moved < 0.05 && dist > meleeRange) stuckTicks += 1;
    else stuckTicks = 0;
    lastPos = bot.entity.position.clone();

    if (
      handleSurvivalTick(bot, {
        stuckTicks,
        setActivity: (s) => {
          entry.activity = s;
        },
      })
    ) {
      return;
    }

    void bot.lookAt(
      bot.entity.position.offset(
        target.position.x - bot.entity.position.x,
        lookY - bot.entity.position.y,
        target.position.z - bot.entity.position.z,
      ),
      true,
    );

    // In range: stick close and keep swinging (interval handles hits)
    if (dist <= meleeRange) {
      if (usingPath) {
        try {
          bot.pathfinder.setGoal(null);
        } catch {
          // ignore
        }
        usingPath = false;
      }
      // Tiny forward pressure so they don't drift out of reach
      bot.setControlState("forward", dist > 2.2);
      bot.setControlState("sprint", false);
      bot.setControlState("jump", false);
      return;
    }

    // Too far → sprint chase; path only when stuck (CPU budget)
    if (stuckTicks > 18) {
      if (!usingPath && tryAcquirePathSlot()) {
        usingPath = true;
        try {
          bot.pathfinder.setGoal(
            new GoalNear(target.position.x, target.position.y, target.position.z, 2),
            true,
          );
        } catch {
          usingPath = false;
        } finally {
          setTimeout(releasePathSlot, 50);
        }
      }
      bot.setControlState("sprint", true);
      entry.activity = `chasing ${label}`;
      if (((bot.pathfinder as { path?: unknown[] }).path?.length ?? 0) === 0) {
        bot.setControlState("forward", true);
        bot.setControlState("jump", stuckTicks > 8 && stuckTicks < 16);
      }
      return;
    }
    if (usingPath) {
      try {
        bot.pathfinder.setGoal(null);
      } catch {
        // ignore
      }
      usingPath = false;
    }

    bot.setControlState("forward", true);
    bot.setControlState("sprint", true);
    bot.setControlState("jump", stuckTicks > 8 && stuckTicks < 14);
    entry.activity = `chasing ${label}`;
  };

  entry.physicsHandler = onTick;
  bot.on("physicsTick", onTick);
  // Stagger attack swings so 20 bots don't hit the same frame
  entry.guardTimer = setInterval(swing, 450 + Math.floor(Math.random() * 200));
  onTick();
  swing();
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

/**
 * Continuous chop/harvest until Stop.
 * One bot per tree (XZ claim + 4-block exclusion). Safe dig (no abort spam).
 */
function startContinuousChop(
  bot: Bot,
  entry: ManagedBot,
  wantRaw: string,
): void {
  clearTimers(entry);
  ensurePathfinder(bot);
  bot.pathfinder.thinkTimeout = 150;
  bot.pathfinder.tickTimeout = 20;
  try {
    bot.pathfinder.setGoal(null);
  } catch {
    // ignore
  }

  const want = normalizeBlockWant(wantRaw);
  const label = want || "log";
  const token = entry.taskToken;
  const stillActive = () =>
    entry.bot === bot && entry.taskToken === token && entry.status === "online";

  let dugTotal = 0;
  entry.error = null;
  entry.activity = `chopping ${label}…`;

  const stopNav = () => {
    try {
      bot.pathfinder.setGoal(null);
    } catch {
      // ignore
    }
    try {
      bot.clearControlStates();
    } catch {
      // ignore
    }
  };

  const approach = async (x: number, y: number, z: number): Promise<boolean> => {
    const dest = new Vec3(x, y, z);
    if (bot.entity.position.distanceTo(dest) <= 3.2) return true;

    // Walk first — do NOT dig dirt/leaves if we can already path to the tree
    try {
      await Promise.race([
        bot.pathfinder.goto(new GoalNear(x, y, z, 3)),
        sleep(7000).then(() => {
          throw new Error("path timeout");
        }),
      ]);
    } catch {
      stopNav();
      // Only if path failed: dig blockers directly in front (not the whole canopy)
      try {
        entry.activity = `clearing path to ${label}`;
        await clearPathToward(
          bot,
          { x, y, z },
          { maxDigs: 4, stillActive },
        );
      } catch {
        // ignore
      }
      const until = Date.now() + 2500;
      while (Date.now() < until && stillActive()) {
        if (bot.entity.position.distanceTo(dest) <= 3.5) break;
        void bot.lookAt(dest.offset(0, 1, 0), true);
        bot.setControlState("forward", true);
        bot.setControlState("sprint", true);
        bot.setControlState("jump", true);
        await sleep(80);
      }
      stopNav();
    }

    return bot.entity.position.distanceTo(dest) <= 4.5;
  };

  /** Walk over nearby item drops (logs) so inventory fills. */
  const pickupNearby = async (): Promise<number> => {
    entry.activity = `picking up ${label}`;
    let got = 0;
    for (let round = 0; round < 6 && stillActive(); round++) {
      const drop = Object.values(bot.entities)
        .filter(
          (e) =>
            e.name === "item" &&
            e.position &&
            e.position.distanceTo(bot.entity.position) < 16,
        )
        .sort(
          (a, b) =>
            a.position.distanceTo(bot.entity.position) -
            b.position.distanceTo(bot.entity.position),
        )[0];
      if (!drop) break;
      try {
        await Promise.race([
          bot.pathfinder.goto(
            new GoalNear(drop.position.x, drop.position.y, drop.position.z, 1),
          ),
          sleep(4000).then(() => {
            throw new Error("pickup path timeout");
          }),
        ]);
      } catch {
        stopNav();
        // Stuck on the way to a drop → clear only what's in front, then walk
        try {
          await clearPathToward(
            bot,
            {
              x: drop.position.x,
              y: drop.position.y,
              z: drop.position.z,
            },
            { maxDigs: 2, stillActive },
          );
        } catch {
          // ignore
        }
        void bot.lookAt(drop.position.offset(0, 0.2, 0), true);
        bot.setControlState("forward", true);
        bot.setControlState("sprint", true);
        await sleep(600);
        stopNav();
      }
      got += 1;
      await sleep(250);
    }
    return got;
  };

  const safeDig = async (block: NonNullable<ReturnType<Bot["blockAt"]>>): Promise<boolean> => {
    stopNav();
    await sleep(60);
    let fresh = bot.blockAt(block.position);
    if (!fresh || !blockMatchesWant(fresh.name, want)) return false;

    // Too high / out of reach → dig dirt & pillar up
    if (bot.entity.position.distanceTo(fresh.position) > 4.5 ||
        fresh.position.y - bot.entity.position.y > 3.8) {
      entry.activity = `scaffolding for ${label}`;
      const reached = await scaffoldToward(
        bot,
        {
          x: fresh.position.x,
          y: fresh.position.y,
          z: fresh.position.z,
        },
        { maxPillars: 8, stillActive },
      );
      if (!reached || !stillActive()) return false;
      // Re-equip axe after placing dirt
      const axe = bot.inventory.items().find((i) => i.name.includes("axe"));
      if (axe) {
        try {
          await bot.equip(axe, "hand");
        } catch {
          // ignore
        }
      }
      fresh = bot.blockAt(block.position);
      if (!fresh || !blockMatchesWant(fresh.name, want)) return false;
    }

    if (bot.entity.position.distanceTo(fresh.position) > 4.8) return false;

    const digTarget = fresh;
    const tryOnce = async () => {
      await bot.lookAt(digTarget.position.offset(0.5, 0.5, 0.5), true);
      await bot.dig(digTarget, true);
    };

    try {
      await tryOnce();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort|cancelled|cancel/i.test(msg)) {
        stopNav();
        await sleep(200);
        const again = bot.blockAt(digTarget.position);
        if (!again || !blockMatchesWant(again.name, want)) return true;
        try {
          await bot.lookAt(again.position.offset(0.5, 0.5, 0.5), true);
          await bot.dig(again, true);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  };

  void (async () => {
    try {
      const axe = bot.inventory
        .items()
        .find((i) => i.name.includes("axe"));
      if (axe) {
        try {
          await bot.equip(axe, "hand");
        } catch {
          // ignore
        }
      }

      // Small random delay so broadcast bots don't pick the same first tree
      await sleep(80 + Math.floor(Math.random() * 700));

      while (stillActive()) {
        purgeChopClaims();

        const positions = bot.findBlocks({
          matching: (block) =>
            !!block?.name && blockMatchesWant(block.name, want),
          maxDistance: 48,
          count: 80,
        });

        // Deduplicate by tree XZ (lowest log per column preferred)
        const byTree = new Map<string, { x: number; y: number; z: number; dist: number }>();
        for (const p of positions) {
          const tk = treeKey(p.x, p.z);
          const dist = bot.entity.position.distanceTo(p as never);
          const prev = byTree.get(tk);
          if (!prev || p.y < prev.y || (p.y === prev.y && dist < prev.dist)) {
            byTree.set(tk, { x: p.x, y: p.y, z: p.z, dist });
          }
        }

        const candidates = [...byTree.values()]
          .filter((c) => !isTreeTakenByOther(entry.username, c.x, c.z, 4))
          .sort((a, b) => a.dist - b.dist);

        let chosen: (typeof candidates)[0] | null = null;
        for (const c of candidates) {
          if (tryClaimTree(entry.username, c.x, c.z)) {
            chosen = c;
            break;
          }
        }

        if (!chosen) {
          entry.activity = `chopping ${label} — searching… ×${dugTotal}`;
          entry.error = null;
          const wander = bot.entity.position.offset(
            Math.floor(Math.random() * 24) - 12,
            0,
            Math.floor(Math.random() * 24) - 12,
          );
          try {
            bot.pathfinder.setGoal(new GoalNear(wander.x, wander.y, wander.z, 2), true);
          } catch {
            // ignore
          }
          await sleep(2000 + Math.floor(Math.random() * 1500));
          stopNav();
          continue;
        }

        entry.activity = `chopping ${label} tree ${Math.floor(chosen.x)},${Math.floor(chosen.z)}`;
        entry.error = null;

        const okApproach = await approach(chosen.x, chosen.y, chosen.z);
        if (!stillActive()) break;
        if (!okApproach) {
          releaseChopClaims(entry.username);
          await sleep(300);
          continue;
        }

        // Dig whole trunk on this XZ (+ slight branches), bottom → top
        const dugKeys = new Set<string>();
        const queue = [new Vec3(chosen.x, chosen.y, chosen.z)];

        while (queue.length > 0 && stillActive() && dugKeys.size < 32) {
          queue.sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return (
              bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b)
            );
          });
          const next = queue.shift()!;
          const key = blockKey(next.x, next.y, next.z);
          if (dugKeys.has(key)) continue;
          dugKeys.add(key);

          const columnBlock = bot.blockAt(next);
          if (!columnBlock || !blockMatchesWant(columnBlock.name, want)) continue;

          if (bot.entity.position.distanceTo(columnBlock.position) > 4) {
            await approach(
              columnBlock.position.x,
              columnBlock.position.y,
              columnBlock.position.z,
            );
            if (!stillActive()) break;
          }

          const dug = await safeDig(columnBlock);
          if (dug) {
            dugTotal += 1;
            entry.activity = `chopping ${label} ×${dugTotal}`;
            entry.error = null;
          }

          for (const [dx, dy, dz] of [
            [0, 1, 0],
            [0, 2, 0],
            [0, -1, 0],
            [1, 0, 0],
            [-1, 0, 0],
            [0, 0, 1],
            [0, 0, -1],
          ] as const) {
            const np = next.offset(dx, dy, dz);
            const nk = blockKey(np.x, np.y, np.z);
            if (dugKeys.has(nk)) continue;
            if (Math.abs(Math.floor(np.x) - Math.floor(chosen.x)) > 1) continue;
            if (Math.abs(Math.floor(np.z) - Math.floor(chosen.z)) > 1) continue;
            queue.push(np);
          }
        }

        // After the tree: pick up drops (no dirt/leaf farming)
        if (stillActive()) {
          await pickupNearby();
          const axeAgain = bot.inventory.items().find((i) => i.name.includes("axe"));
          if (axeAgain) {
            try {
              await bot.equip(axeAgain, "hand");
            } catch {
              // ignore
            }
          }
        }

        releaseChopClaims(entry.username);
        await sleep(250 + Math.floor(Math.random() * 400));
      }
    } catch (err) {
      if (stillActive()) {
        entry.error = err instanceof Error ? err.message : String(err);
        entry.activity = dugTotal > 0 ? `chopped ${dugTotal} ${label}` : "idle";
      }
    } finally {
      releaseChopClaims(entry.username);
      stopNav();
      if (stillActive()) {
        entry.activity = dugTotal > 0 ? `chopped ${dugTotal} ${label}` : "idle";
      }
    }
  })();
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
    processManager.on("status", (serverId: string, status: string) => {
      if (status === "STOPPED" || status === "STOPPING" || status === "ERROR") {
        void this.stopBots(serverId);
      }
    });
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
