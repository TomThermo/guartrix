import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { clearSurvivalBusy, handleSurvivalTick } from "../bot-survival.js";
import {
  clearTimers,
  ensurePathfinder,
  obstacleAhead,
  releasePathSlot,
  tryAcquirePathSlot,
  type ManagedBot,
} from "./shared.js";

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

/** Pathfind to coords — walk around trees via detours when stuck. */
export function startGoto(
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
