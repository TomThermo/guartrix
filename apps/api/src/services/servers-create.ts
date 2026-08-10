import type { FastifyRequest } from "fastify";
import type { AuthUser, ServerExtraMount, ServerType } from "@guartrix/shared";
import { primaryAllocationProtocol } from "@guartrix/shared";
import type { z } from "zod";
import { logActivity } from "../activity-log.js";
import { assertCanCreateServer } from "../billing/quotas.js";
import { assertNodeCapacity, resolveCreateNodeId } from "../nodes/nodes.js";
import { parseExtraMounts } from "../servers/extra-mounts.js";
import { isGamePortAvailable } from "../servers/game-port.js";
import { beginPanelServerCreate, finishPanelCreateInBackground } from "../servers/server-provision.js";
import { toMcServer } from "../servers/serialize.js";
import { createServerClientSchema } from "../schemas/servers.js";

export type PanelCreateServerInput = z.infer<typeof createServerClientSchema>;

export type CreatePanelServerResult =
  | { ok: true; body: ReturnType<typeof toMcServer>; status: 201 }
  | { ok: false; status: number; error: string | object };

export async function createPanelServer(
  user: AuthUser,
  data: PanelCreateServerInput,
  request: FastifyRequest,
): Promise<CreatePanelServerResult> {
  let validatedExtraMounts: ServerExtraMount[] | null | undefined;
  if (data.extraMounts !== undefined) {
    try {
      validatedExtraMounts = parseExtraMounts(data.extraMounts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 400, error: message };
    }
  }

  try {
    await assertCanCreateServer(user, data.memoryMb, { diskMb: data.diskMb });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 403, error: message };
  }

  if (data.nodeId && user.role !== "ADMIN") {
    return { ok: false, status: 403, error: "Only admins can choose a node" };
  }

  let nodeId: string;
  try {
    nodeId = await resolveCreateNodeId(user.role === "ADMIN" ? data.nodeId : undefined);
    await assertNodeCapacity(nodeId, data.memoryMb, {
      placement: true,
      diskMb: data.diskMb,
      cpuLimit: data.cpuLimit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, error: message };
  }

  if (!(await isGamePortAvailable(nodeId, data.port, data.type))) {
    const protocol = primaryAllocationProtocol(data.type);
    return {
      ok: false,
      status: 409,
      error: `Port ${data.port}/${protocol} is already in use`,
    };
  }

  const baseInput = {
    name: data.name,
    type: data.type as ServerType,
    mcVersion: data.mcVersion,
    port: data.port,
    memoryMb: data.memoryMb,
    diskMb: data.diskMb,
    cpuLimit: data.cpuLimit,
    ownerId: user.id,
    nodeId,
    ensureSubdomain: true,
    cleanupOnFailure: false,
    ...(validatedExtraMounts !== undefined ? { extraMounts: validatedExtraMounts } : {}),
  };

  try {
    const { id, server } = await beginPanelServerCreate(baseInput);

    void finishPanelCreateInBackground({
      input: { id, ...baseInput },
      world: {
        seed: data.seed,
        gamemode: data.gamemode,
        difficulty: data.difficulty,
        worldPreset: data.worldPreset,
        keepCount: data.keepCount,
      },
      activity: {
        actorUserId: user.id,
        actorUsername: user.username,
      },
    });

    return { ok: true, body: toMcServer(server), status: 201 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logActivity({
      action: "server.create",
      request,
      user,
      serverId: null,
      serverName: data.name,
      success: false,
      metadata: { error: message, type: data.type, port: data.port },
    });
    const status = message.includes("already in use") ? 409 : 500;
    return { ok: false, status, error: message };
  }
}
