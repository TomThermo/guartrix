import type {
  CreateSubUserRequest,
  CreateSubUserResponse,
  ServerSubUser,
  UpdateSubUserRequest,
} from "@msm/shared";
import { request } from "./client";

export const serverSubusersApi = {
  listSubUsers: (id: string) =>
    request<{ subusers: ServerSubUser[] }>(`/api/servers/${id}/subusers`),
  createSubUser: (id: string, body: CreateSubUserRequest) =>
    request<CreateSubUserResponse>(`/api/servers/${id}/subusers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubUser: (id: string, subUserId: string, body: UpdateSubUserRequest) =>
    request<{ subuser: ServerSubUser }>(
      `/api/servers/${id}/subusers/${encodeURIComponent(subUserId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteSubUser: (id: string, subUserId: string) =>
    request<void>(
      `/api/servers/${id}/subusers/${encodeURIComponent(subUserId)}`,
      { method: "DELETE" },
    ),
  resendSubUserInvite: (id: string, subUserId: string) =>
    request<{ subuser: ServerSubUser; inviteUrl?: string }>(
      `/api/servers/${id}/subusers/${encodeURIComponent(subUserId)}/invite`,
      { method: "POST" },
    ),
};
