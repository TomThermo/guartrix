import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { handleSurvivalTick } from "../bots/bot-survival.js";
import {
  blockedAhead,
  clearTimers,
  ensurePathfinder,
  obstacleAhead,
  releasePathSlot,
  tryAcquirePathSlot,
  type ManagedBot,
} from "./shared.js";

const { goals } = pathfinderPkg;
const { GoalNear, GoalFollow } = goals;

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

/**
 * Fast follow for many bots: sprint by default.
 * Pathfinder only when stuck/blocked (A* is expensive ×20).
 */
export function startSmoothFollow(
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
