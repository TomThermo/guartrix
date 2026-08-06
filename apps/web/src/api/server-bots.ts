import type {
  BotCommandRequest,
  BotInfo,
  SpawnBotsRequest,
} from "@msm/shared";
import { request } from "./client";

export const serverBotsApi = {
  listBots: (id: string) =>
    request<{ bots: BotInfo[] }>(`/api/servers/${id}/bots`),
  spawnBots: (id: string, body?: SpawnBotsRequest) =>
    request<{ bots: BotInfo[] }>(`/api/servers/${id}/bots`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  stopAllBots: (id: string) =>
    request<{ ok: boolean; bots: BotInfo[] }>(`/api/servers/${id}/bots`, {
      method: "DELETE",
    }),
  botCommand: (id: string, name: string, body: BotCommandRequest) =>
    request<{ bot?: BotInfo; bots?: BotInfo[] }>(
      `/api/servers/${id}/bots/${encodeURIComponent(name)}/command`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
