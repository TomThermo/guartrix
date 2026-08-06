import type { BotCommandRequest } from "@msm/shared";

export type CmdType = BotCommandRequest["type"];

export interface BuildBotCommandInput {
  cmdType: CmdType;
  sayText: string;
  yaw: number;
  pitch: number;
  gotoMode: "coords" | "player";
  playerName: string;
  gotoX: number;
  gotoY: number;
  gotoZ: number;
  itemName: string;
  chopLog: string;
  guardRadius: number;
  aiPrompt: string;
}

export function buildBotCommand(input: BuildBotCommandInput): BotCommandRequest {
  const {
    cmdType,
    sayText,
    yaw,
    pitch,
    gotoMode,
    playerName,
    gotoX,
    gotoY,
    gotoZ,
    itemName,
    chopLog,
    guardRadius,
    aiPrompt,
  } = input;

  switch (cmdType) {
    case "say":
      return { type: "say", text: sayText };
    case "look":
      return { type: "look", yaw, pitch };
    case "quit":
      return { type: "quit" };
    case "stop":
      return { type: "stop" };
    case "jump":
      return { type: "jump" };
    case "goto":
      if (gotoMode === "player") {
        const name = playerName.trim();
        if (!name) throw new Error("Select an online player for goto");
        return { type: "goto", player: name };
      }
      return { type: "goto", x: gotoX, y: gotoY, z: gotoZ };
    case "follow":
      return { type: "follow", player: playerName.trim() };
    case "attack":
      return playerName.trim()
        ? { type: "attack", player: playerName.trim() }
        : { type: "attack" };
    case "collect":
      return {
        type: "collect",
        item: itemName.trim() || undefined,
        count: 16,
      };
    case "chop":
      return {
        type: "chop",
        block: chopLog || "birch_log",
      };
    case "dig":
      return {
        type: "dig",
        block: itemName.trim() || undefined,
      };
    case "wander":
      return { type: "wander" };
    case "guard":
      return { type: "guard", radius: guardRadius };
    case "ai":
      return { type: "ai", prompt: aiPrompt };
    default: {
      const _e: never = cmdType;
      throw new Error(`Unknown type ${_e}`);
    }
  }
}
