import type { BotCommandRequest } from "@msm/shared";

/**
 * Tiny NL → bot command mapper (NL/EN). Not a full LLM — intentional, offline, fast.
 */
export function parseBotAiPrompt(prompt: string): BotCommandRequest {
  const raw = prompt.trim();
  if (!raw) throw new Error("Empty AI prompt");
  const text = raw.toLowerCase();

  // quit / leave
  if (
    /^(quit|leave|disconnect|uitloggen|wegwezen|ga weg)\b/.test(text) ||
    text === "stop bot"
  ) {
    return { type: "quit" };
  }

  // stop current goal
  if (
    /^(stop|halt|idle|stil|stoppen|blijf staan|stand still)\b/.test(text) ||
    text === "cancel"
  ) {
    return { type: "stop" };
  }

  // jump
  if (/^(jump|spring|springen)\b/.test(text)) {
    return { type: "jump" };
  }

  // wander / explore
  if (
    /^(wander|explore|rondlopen|dwaal|loop rond|random walk)\b/.test(text)
  ) {
    return { type: "wander" };
  }

  // guard
  const guard = text.match(/^(guard|bewaak|verdedig|protect)\b(?:\s+(\d+))?/);
  if (guard) {
    return {
      type: "guard",
      radius: guard[2] ? Number(guard[2]) : 8,
    };
  }

  // say / chat / zeg
  const say =
    text.match(/^(say|chat|zeg|praat)\s+(.+)$/i) ??
    raw.match(/^(say|chat|zeg|praat)\s+(.+)$/i);
  if (say?.[2]) {
    return { type: "say", text: say[2].trim() };
  }

  // follow
  const follow = text.match(
    /^(follow|volg|kom achter)\s+([a-z0-9_]{1,16})$/i,
  );
  if (follow?.[2]) {
    return { type: "follow", player: follow[2] };
  }
  if (/^(follow me|volg mij|volg me)\b/.test(text)) {
    throw new Error(
      'Pick a real player in the Follow box (bots are filtered out), e.g. select your name then "All bots follow".',
    );
  }

  // attack
  const attack = text.match(
    /^(attack|kill|fight|val aan|aanvallen)\s*([a-z0-9_]{1,16})?$/i,
  );
  if (attack) {
    return attack[2]
      ? { type: "attack", player: attack[2] }
      : { type: "attack" };
  }

  // chop continuously until stop (hak birch_log / chop oak_log)
  const chop = text.match(
    /^(chop|hak|kappen|hout\s+hakken|blijf\s+hakken|chop\s+wood)\s*([a-z0-9_:.-]+)?$/i,
  );
  if (chop) {
    return {
      type: "chop",
      block: (chop[2] ?? "birch_log").replace(/^minecraft:/, ""),
    };
  }

  // collect (finite batch)
  const collect = text.match(
    /^(collect|gather|verzamel|pak|mine)\s+([a-z0-9_:.-]+)(?:\s+(\d+))?$/i,
  );
  if (collect?.[2]) {
    return {
      type: "collect",
      item: collect[2].replace(/^minecraft:/, ""),
      count: collect[3] ? Number(collect[3]) : 16,
    };
  }
  if (/^(collect|verzamel|gather)\b/.test(text)) {
    return { type: "collect", count: 16 };
  }

  // dig / break (one block)
  const dig = text.match(
    /^(dig|break|graaf|breek)\s*([a-z0-9_:.-]+)?$/i,
  );
  if (dig) {
    return dig[2]
      ? { type: "dig", block: dig[2].replace(/^minecraft:/, "") }
      : { type: "dig" };
  }

  // goto x y z
  const goto = text.match(
    /^(?:goto|go|loop|gaan|naar)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/,
  );
  if (goto) {
    return {
      type: "goto",
      x: Number(goto[1]),
      y: Number(goto[2]),
      z: Number(goto[3]),
    };
  }

  // goto <player> / gaan naar Steve
  const gotoPlayer = text.match(
    /^(?:goto|go|loop\s+naar|gaan\s+naar|naar)\s+([a-z0-9_]{1,16})$/i,
  );
  if (gotoPlayer) {
    return { type: "goto", player: gotoPlayer[1]! };
  }

  // look
  const look = text.match(
    /^(look|kijk)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/,
  );
  if (look) {
    return { type: "look", yaw: Number(look[1]), pitch: Number(look[2]) };
  }

  throw new Error(
    `Unknown AI prompt. Try: stop, wander, guard, jump, say hi, follow Steve, chop birch_log, collect oak_log, dig stone, goto 10 64 -20, goto Steve`,
  );
}
