import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";

const PLACEABLE = new Set([
  "dirt",
  "grass_block",
  "cobblestone",
  "stone",
  "deepslate",
  "cobbled_deepslate",
  "netherrack",
  "sand",
  "gravel",
  "oak_planks",
  "spruce_planks",
  "birch_planks",
  "jungle_planks",
  "acacia_planks",
  "dark_oak_planks",
  "mangrove_planks",
  "cherry_planks",
  "bamboo_planks",
  "andesite",
  "diorite",
  "granite",
  "tuff",
  "terracotta",
  "clay",
]);

const DIG_FOR_PLACE = new Set([
  "dirt",
  "grass_block",
  "cobblestone",
  "stone",
  "sand",
  "gravel",
  "netherrack",
  "andesite",
  "diorite",
  "granite",
  "deepslate",
  "cobbled_deepslate",
  "tuff",
  "clay",
]);

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const busy = new WeakMap<Bot, boolean>();
const busySince = new WeakMap<Bot, number>();

function setBusy(bot: Bot, value: boolean): void {
  busy.set(bot, value);
  if (value) busySince.set(bot, Date.now());
  else busySince.delete(bot);
}

function isBusy(bot: Bot): boolean {
  if (busy.get(bot) !== true) return false;
  // Never stay in escaping forever (failed dig/place)
  const since = busySince.get(bot) ?? 0;
  if (Date.now() - since > 6000) {
    setBusy(bot, false);
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Throttle expensive land scans (20 bots × every tick freezes Node). */
const landScanAt = new WeakMap<Bot, number>();
const landCache = new WeakMap<Bot, { at: number; pos: ReturnType<typeof findLandLook> }>();

function findLandLookThrottled(bot: Bot) {
  const now = Date.now();
  const cached = landCache.get(bot);
  if (cached && now - cached.at < 800) return cached.pos;
  const last = landScanAt.get(bot) ?? 0;
  if (now - last < 400) return cached?.pos ?? null;
  landScanAt.set(bot, now);
  const pos = findLandLook(bot);
  landCache.set(bot, { at: now, pos });
  return pos;
}

function blockName(block: { name?: string } | null): string {
  return (block?.name ?? "").replace(/^minecraft:/, "");
}

function isWaterLike(block: { name?: string } | null): boolean {
  const n = blockName(block);
  return n === "water" || n === "lava" || n.endsWith("_water") || n.includes("water");
}

function isAirLike(block: { name?: string; boundingBox?: string } | null): boolean {
  if (!block) return true;
  const n = blockName(block);
  return n === "air" || n === "cave_air" || n === "void_air" || block.boundingBox === "empty";
}

function isSolid(block: { name?: string; boundingBox?: string } | null): boolean {
  if (!block) return false;
  if (isAirLike(block) || isWaterLike(block)) return false;
  return block.boundingBox === "block" || (!isAirLike(block) && !isWaterLike(block));
}

function inWater(bot: Bot): boolean {
  const ent = bot.entity as { isInWater?: boolean };
  if (ent.isInWater) return true;
  const feet = bot.blockAt(bot.entity.position);
  const mid = bot.blockAt(bot.entity.position.offset(0, 0.9, 0));
  return isWaterLike(feet) || isWaterLike(mid);
}

function countTightWalls(bot: Bot): number {
  const p = bot.entity.position;
  let walls = 0;
  for (const [dx, dz] of DIRS) {
    const body = bot.blockAt(p.offset(dx, 0, dz));
    const head = bot.blockAt(p.offset(dx, 1, dz));
    if (isSolid(body) || isSolid(head)) walls += 1;
  }
  return walls;
}

/** Stuck in a 1–2 deep pit / trench (walls around, open sky). */
function isInHole(bot: Bot): boolean {
  if (inWater(bot)) return false;
  const walls = countTightWalls(bot);
  if (walls < 3) return false;
  const above = bot.blockAt(bot.entity.position.offset(0, 2, 0));
  if (isSolid(above)) return false;
  // At least one neighbor rim is higher (classic hole)
  const p = bot.entity.position;
  let rims = 0;
  for (const [dx, dz] of DIRS) {
    if (isSolid(bot.blockAt(p.offset(dx, 1, dz)))) rims += 1;
  }
  return rims >= 2;
}

function findLandLook(bot: Bot): Vec3 | null {
  const pos = bot.entity.position;
  for (let r = 1; r <= 6; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        for (let dy = -2; dy <= 3; dy++) {
          const ground = bot.blockAt(pos.offset(dx, dy, dz));
          const above = bot.blockAt(pos.offset(dx, dy + 1, dz));
          const above2 = bot.blockAt(pos.offset(dx, dy + 2, dz));
          if (
            isSolid(ground) &&
            !isWaterLike(ground) &&
            isAirLike(above) &&
            !isWaterLike(above) &&
            isAirLike(above2)
          ) {
            return new Vec3(pos.x + dx, pos.y + dy + 1, pos.z + dz);
          }
        }
      }
    }
  }
  return null;
}

function findPlaceableItem(bot: Bot) {
  return bot.inventory.items().find((i) => PLACEABLE.has(i.name.replace(/^minecraft:/, "")));
}

async function digNearbyPlaceable(bot: Bot): Promise<boolean> {
  const p = bot.entity.position;
  const feetY = Math.floor(p.y);
  // Walls first, then dirt beside feet (for scaffolding) — never dig under yourself
  const candidates: Array<{ x: number; y: number; z: number }> = [];
  for (const [dx, dz] of DIRS) {
    for (const dy of [1, 0, -1]) {
      candidates.push({ x: dx, y: dy, z: dz });
    }
  }
  for (const c of candidates) {
    const block = bot.blockAt(p.offset(c.x, c.y, c.z));
    if (!block || !DIG_FOR_PLACE.has(blockName(block))) continue;
    if (!isSolid(block)) continue;
    // Never dig the block we're standing on
    if (
      Math.floor(block.position.x) === Math.floor(p.x) &&
      Math.floor(block.position.z) === Math.floor(p.z) &&
      Math.floor(block.position.y) <= feetY
    ) {
      continue;
    }
    try {
      await bot.dig(block);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/** Block pressed on head / ceiling — dig it out so they can stand/jump. */
async function clearCeilingTrap(bot: Bot, setActivity: (s: string) => void): Promise<boolean> {
  const p = bot.entity.position;
  const above = bot.blockAt(p.offset(0, 1.8, 0));
  const above2 = bot.blockAt(p.offset(0, 2.1, 0));
  const target = (above && isSolid(above) ? above : null) ?? (above2 && isSolid(above2) ? above2 : null);
  if (!target) return false;
  setActivity("clearing ceiling");
  try {
    await bot.dig(target);
    return true;
  } catch {
    return false;
  }
}

async function pillarOnce(bot: Bot): Promise<boolean> {
  const item = findPlaceableItem(bot);
  if (!item) return false;
  try {
    await bot.equip(item, "hand");
  } catch {
    return false;
  }

  try {
    bot.clearControlStates();
  } catch {
    // ignore
  }

  // Look straight down — place packets are more reliable that way
  try {
    await bot.look(bot.entity.yaw, Math.PI / 2, true);
  } catch {
    // ignore
  }

  const standX = Math.floor(bot.entity.position.x);
  const standZ = Math.floor(bot.entity.position.z);
  const startY = bot.entity.position.y;
  const groundY = Math.floor(startY) - 1;

  bot.setControlState("jump", true);

  let placed = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(40);

    // Wait until we leave the ground a bit
    if (bot.entity.onGround && attempt < 4) continue;

    // Block we stood on / currently under us
    const ref =
      bot.blockAt(new Vec3(standX, Math.floor(bot.entity.position.y) - 1, standZ)) ??
      bot.blockAt(new Vec3(standX, groundY, standZ));

    if (!ref || !isSolid(ref)) continue;

    // Already have a block at our feet level → success
    const feet = bot.blockAt(new Vec3(standX, Math.floor(bot.entity.position.y), standZ));
    if (feet && isSolid(feet) && feet.position.y >= groundY + 1) {
      placed = true;
      break;
    }

    try {
      // Prefer forceLook place API when available
      const place = (
        bot as Bot & {
          _placeBlockWithOptions?: (
            b: NonNullable<ReturnType<Bot["blockAt"]>>,
            f: Vec3,
            o: object,
          ) => Promise<void>;
        }
      )._placeBlockWithOptions;
      if (place) {
        await place(ref, new Vec3(0, 1, 0), {
          forceLook: true,
          swingArm: "right",
        });
      } else {
        await bot.placeBlock(ref, new Vec3(0, 1, 0));
      }
      placed = true;
      break;
    } catch {
      // keep holding jump and retry
    }
  }

  bot.setControlState("jump", false);
  await sleep(80);

  // Success if we placed OR actually went up
  return placed || bot.entity.position.y > startY + 0.8;
}

/** Dig dirt/grass nearby if inventory has no placeable blocks. */
export async function ensureScaffoldBlocks(bot: Bot): Promise<boolean> {
  if (findPlaceableItem(bot)) return true;
  for (let i = 0; i < 5; i++) {
    const ok = await digNearbyPlaceable(bot);
    if (!ok) break;
    await sleep(80);
    if (findPlaceableItem(bot)) return true;
  }
  return !!findPlaceableItem(bot);
}

/**
 * Pillar up with dirt/cobble until within reach of target Y (or max steps).
 */
export async function scaffoldToward(
  bot: Bot,
  target: { x: number; y: number; z: number },
  opts?: { maxPillars?: number; stillActive?: () => boolean },
): Promise<boolean> {
  const maxPillars = opts?.maxPillars ?? 8;
  const still = opts?.stillActive ?? (() => true);
  let fails = 0;

  for (let i = 0; i < maxPillars; i++) {
    if (!still()) return false;
    const dest = new Vec3(target.x, target.y, target.z);
    const dist = bot.entity.position.distanceTo(dest);
    const reachY = target.y - bot.entity.position.y;
    if (dist <= 4.5 && reachY <= 4.2 && reachY >= -1.5) return true;
    if (reachY <= 3.5 && dist <= 4.5) return true;
    if (reachY < 1) return dist <= 4.5;

    if (!(await ensureScaffoldBlocks(bot))) return false;
    const beforeY = bot.entity.position.y;
    const placed = await pillarOnce(bot);
    if (!placed || bot.entity.position.y < beforeY + 0.6) {
      fails += 1;
      if (fails >= 3) return false;
      await sleep(150);
      continue;
    }
    fails = 0;
    await sleep(100);
  }

  return (
    bot.entity.position.distanceTo(new Vec3(target.x, target.y, target.z)) <= 4.8
  );
}

function isPathClearableBlock(name: string): boolean {
  const n = name.replace(/^minecraft:/, "").toLowerCase();
  // Never treat logs as "path clear" — those are chop targets
  if (n.includes("_log") || n.includes("_stem") || n.includes("_hyphae")) return false;
  if (n.includes("leaves") || n.includes("leaf")) return true;
  if (n.includes("vine") || n === "cobweb" || n === "web") return true;
  if (DIG_FOR_PLACE.has(n)) return true;
  if (
    n === "dirt" ||
    n === "grass_block" ||
    n === "podzol" ||
    n === "moss_block" ||
    n === "mud" ||
    n === "clay" ||
    n === "snow_block" ||
    n === "cobblestone"
  ) {
    return true;
  }
  return false;
}

/**
 * Dig at most ONE block that is directly in front of the bot (body/head).
 * Used only when movement is blocked — not for farming leaves/dirt.
 */
async function digBlockerAhead(bot: Bot): Promise<boolean> {
  const yaw = bot.entity.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const p = bot.entity.position;

  for (const dist of [0.9, 1.3, 1.7]) {
    for (const dy of [0, 1]) {
      const block = bot.blockAt(p.offset(fx * dist, dy, fz * dist));
      if (!block || !isSolid(block)) continue;
      const n = blockName(block);
      if (!isPathClearableBlock(n)) continue;
      try {
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
        await bot.dig(block, true);
        return true;
      } catch {
        // try next
      }
    }
  }
  return false;
}

/**
 * Only clear dirt/leaves that are pressed against the bot in front.
 * Does NOT dig canopy / dirt around the tree "just in case".
 */
export async function clearBlockingScaffold(bot: Bot): Promise<void> {
  await digBlockerAhead(bot);
}

/**
 * When pathfinding failed: dig a few blockers directly ahead only.
 */
export async function clearPathToward(
  bot: Bot,
  _target: { x: number; y: number; z: number },
  opts?: { maxDigs?: number; stillActive?: () => boolean },
): Promise<number> {
  const maxDigs = Math.min(6, opts?.maxDigs ?? 4);
  const still = opts?.stillActive ?? (() => true);
  let dug = 0;
  for (let i = 0; i < maxDigs && still(); i++) {
    const ok = await digBlockerAhead(bot);
    if (!ok) break;
    dug += 1;
    await sleep(40);
  }
  return dug;
}

export { findPlaceableItem, pillarOnce };

/** Dig a stair step forward, then place footing if needed. */
async function stairEscape(bot: Bot): Promise<boolean> {
  const yaw = bot.entity.yaw;
  let dirX = Math.round(-Math.sin(yaw));
  let dirZ = Math.round(-Math.cos(yaw));
  if (dirX === 0 && dirZ === 0) {
    dirX = Math.abs(-Math.sin(yaw)) >= Math.abs(-Math.cos(yaw)) ? Math.sign(-Math.sin(yaw)) || 1 : 0;
    dirZ = dirX === 0 ? Math.sign(-Math.cos(yaw)) || 1 : 0;
  }

  const p = bot.entity.position;
  // Only clear rim / head space in front — never dig the floor under feet
  for (const dy of [2, 1]) {
    const wall = bot.blockAt(p.offset(dirX, dy, dirZ));
    if (wall && isSolid(wall)) {
      try {
        await bot.dig(wall);
      } catch {
        // continue
      }
    }
  }

  // Place a step under feet toward exit if we have blocks
  if (findPlaceableItem(bot)) {
    try {
      await bot.equip(findPlaceableItem(bot)!, "hand");
      const floor = bot.blockAt(p.floored().offset(0, -1, 0));
      if (floor && isSolid(floor)) {
        bot.setControlState("jump", true);
        await sleep(120);
        await bot.placeBlock(floor, new Vec3(dirX, 0, dirZ));
        bot.setControlState("jump", false);
      }
    } catch {
      // ignore
    }
  }

  bot.setControlState("forward", true);
  bot.setControlState("jump", true);
  await sleep(350);
  bot.setControlState("jump", false);
  return !isInHole(bot);
}

async function escapeHole(bot: Bot, setActivity: (s: string) => void): Promise<void> {
  if (isBusy(bot)) return;
  setBusy(bot, true);
  try {
    setActivity("escaping hole");
    try {
      bot.pathfinder?.setGoal(null);
    } catch {
      // ignore
    }
    bot.clearControlStates();

    await clearCeilingTrap(bot, setActivity);

    if (!findPlaceableItem(bot)) {
      setActivity("mining escape blocks");
      await digNearbyPlaceable(bot);
    }

    for (let i = 0; i < 3; i++) {
      if (!isInHole(bot) && countTightWalls(bot) < 3) break;
      setActivity("pillaring out");
      const ok = await pillarOnce(bot);
      if (!ok) break;
      await sleep(150);
    }

    if (isInHole(bot) || countTightWalls(bot) >= 3) {
      setActivity("stair escape");
      await stairEscape(bot);
    }

    await clearCeilingTrap(bot, setActivity);

    bot.setControlState("forward", true);
    bot.setControlState("jump", true);
    await sleep(400);
    bot.clearControlStates();
  } finally {
    setBusy(bot, false);
  }
}

/**
 * Call at the start of movement ticks.
 * Returns true when this tick is handled (caller should skip normal chase).
 */
export function handleSurvivalTick(
  bot: Bot,
  opts: {
    stuckTicks?: number;
    setActivity?: (s: string) => void;
    /** goto/follow: only water + real holes, don't false-trigger on trees */
    mode?: "default" | "navigate";
  } = {},
): boolean {
  const setActivity = opts.setActivity ?? (() => undefined);
  const mode = opts.mode ?? "default";

  if (isBusy(bot)) {
    setActivity("escaping…");
    return true;
  }

  const stuck = opts.stuckTicks ?? 0;

  // Ceiling trap: only when really stuck with solid on head
  const headBlock = bot.blockAt(bot.entity.position.offset(0, 1.8, 0));
  if (stuck > 15 && headBlock && isSolid(headBlock)) {
    void (async () => {
      if (isBusy(bot)) return;
      setBusy(bot, true);
      try {
        await clearCeilingTrap(bot, setActivity);
      } finally {
        setBusy(bot, false);
      }
    })();
    return true;
  }

  if (inWater(bot)) {
    setActivity("swimming to land");
    bot.setControlState("sprint", false);
    bot.setControlState("jump", true);

    const land = findLandLookThrottled(bot);
    if (land) {
      void bot.lookAt(land.offset(0, 1, 0), true);
      bot.setControlState("forward", true);
    } else {
      bot.setControlState("forward", true);
    }

    const head = bot.blockAt(bot.entity.position.offset(0, 1.2, 0));
    if (!isWaterLike(head)) {
      bot.setControlState("jump", true);
      bot.setControlState("sprint", true);
    }
    return true;
  }

  // Real pit only — NOT "stuck against a tree" (walls >= 2 is too eager for goto)
  if (stuck > 25 && isInHole(bot)) {
    void escapeHole(bot, setActivity);
    return true;
  }

  // Default mode can also try when tightly boxed in
  if (mode === "default" && stuck > 35 && countTightWalls(bot) >= 3) {
    void escapeHole(bot, setActivity);
    return true;
  }

  return false;
}

export function isSurvivalBusy(bot: Bot): boolean {
  return isBusy(bot);
}

export function clearSurvivalBusy(bot: Bot): void {
  setBusy(bot, false);
}
