import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { handleSurvivalTick } from "../bot-survival.js";
import {
  clearTimers,
  releasePathSlot,
  tryAcquirePathSlot,
  type ManagedBot,
} from "./shared.js";

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

/**
 * Chase a target and keep hitting them (not a one-shot swing).
 */
export function startChaseAttack(
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
