import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import type { BotStatus } from "@msm/shared";

const { pathfinder, Movements } = pathfinderPkg;

export interface ManagedBot {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clearTimers(entry: ManagedBot): void {
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

export function tryAcquirePathSlot(): boolean {
  if (pathSlotsInUse >= MAX_PATH_SLOTS) return false;
  pathSlotsInUse += 1;
  return true;
}

export function releasePathSlot(): void {
  pathSlotsInUse = Math.max(0, pathSlotsInUse - 1);
}

export function ensurePathfinder(bot: Bot): void {
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

/** Look at blocks ahead: step-up (1 high) vs tall obstacle (tree/wall). */
export function obstacleAhead(bot: Bot): {
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
export function blockedAhead(bot: Bot): boolean {
  const o = obstacleAhead(bot);
  return o.stepUp || o.tall;
}
