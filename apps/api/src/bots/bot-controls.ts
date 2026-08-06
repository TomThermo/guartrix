import type { Bot } from "mineflayer";
import { clearSurvivalBusy } from "./bot-survival.js";
import {
  clearTimers,
  releaseChopClaims,
  type ManagedBot,
} from "../bot-movement/index.js";

/** Hold jump across physics ticks (a short setTimeout often gets dropped via Via*). */
export function startJump(bot: Bot, entry: ManagedBot): void {
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

export function stopMovement(bot: Bot, entry: ManagedBot): void {
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
export function interruptOngoing(bot: Bot, entry: ManagedBot): void {
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
