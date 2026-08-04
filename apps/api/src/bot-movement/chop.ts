import type { Bot } from "mineflayer";
import pathfinderPkg from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { clearPathToward, scaffoldToward } from "../bot-survival.js";
import { clearTimers, ensurePathfinder, sleep, type ManagedBot } from "./shared.js";

const { goals } = pathfinderPkg;
const { GoalNear } = goals;

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

export function releaseChopClaims(owner: string): void {
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

export function isLogLikeName(name: string): boolean {
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

/**
 * Continuous chop/harvest until Stop.
 * One bot per tree (XZ claim + 4-block exclusion). Safe dig (no abort spam).
 */
export function startContinuousChop(
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
