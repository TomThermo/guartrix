import type {
  BansResponse,
  OnlinePlayersResponse,
  PlayersResponse,
} from "@msm/shared";
import { request } from "./client";

export const serverPlayersApi = {
  getPlayers: (id: string) =>
    request<PlayersResponse>(`/api/servers/${id}/players`),
  getOnlinePlayers: (id: string) =>
    request<OnlinePlayersResponse>(`/api/servers/${id}/online`),
  getAllOnlinePlayers: () =>
    request<Record<string, OnlinePlayersResponse>>("/api/servers/online"),
  playerAction: (
    id: string,
    body: {
      action: string;
      name: string;
      reason?: string;
      message?: string;
      item?: string;
      count?: number;
      gamemode?: string;
    },
  ) =>
    request<{ ok: boolean; command: string; action: string; name: string }>(
      `/api/servers/${id}/players/action`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listPlayerModeration: (id: string, player?: string) => {
    const q = player ? `?player=${encodeURIComponent(player)}` : "";
    return request<{ events: import("@msm/shared").PlayerModerationEvent[] }>(
      `/api/servers/${id}/players/moderation${q}`,
    );
  },
  addWhitelist: (id: string, name: string) =>
    request<PlayersResponse>(`/api/servers/${id}/whitelist`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  removeWhitelist: (id: string, name: string) =>
    request<PlayersResponse>(
      `/api/servers/${id}/whitelist/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  addOp: (id: string, name: string, level = 4) =>
    request<PlayersResponse>(`/api/servers/${id}/ops`, {
      method: "POST",
      body: JSON.stringify({ name, level }),
    }),
  removeOp: (id: string, name: string) =>
    request<PlayersResponse>(
      `/api/servers/${id}/ops/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  getBans: (id: string) => request<BansResponse>(`/api/servers/${id}/bans`),
  addPlayerBan: (id: string, name: string, reason?: string, expires?: string) =>
    request<BansResponse>(`/api/servers/${id}/bans/players`, {
      method: "POST",
      body: JSON.stringify({ name, reason, expires }),
    }),
  updatePlayerBan: (
    id: string,
    name: string,
    body: { reason?: string; expires?: string },
  ) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/players/${encodeURIComponent(name)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  removePlayerBan: (id: string, name: string) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/players/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  addIpBan: (id: string, ip: string, reason?: string, expires?: string) =>
    request<BansResponse>(`/api/servers/${id}/bans/ips`, {
      method: "POST",
      body: JSON.stringify({ ip, reason, expires }),
    }),
  updateIpBan: (
    id: string,
    ip: string,
    body: { reason?: string; expires?: string },
  ) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/ips/${encodeURIComponent(ip)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  removeIpBan: (id: string, ip: string) =>
    request<BansResponse>(
      `/api/servers/${id}/bans/ips/${encodeURIComponent(ip)}`,
      { method: "DELETE" },
    ),
};
