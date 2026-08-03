import { nanoid } from "nanoid";
import { prisma } from "./db.js";

export async function recordModerationEvent(input: {
  serverId: string;
  playerName: string;
  uuid?: string | null;
  action: string;
  reason?: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    await prisma.playerModerationEvent.create({
      data: {
        id: nanoid(12),
        serverId: input.serverId,
        playerName: input.playerName.trim(),
        uuid: input.uuid ?? null,
        action: input.action,
        reason: input.reason?.trim() || null,
        actorUserId: input.actorUserId ?? null,
      },
    });
  } catch (err) {
    console.warn(
      "[guartrix] moderation event write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function listModerationEvents(
  serverId: string,
  opts?: { playerName?: string; limit?: number },
) {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
  const rows = await prisma.playerModerationEvent.findMany({
    where: {
      serverId,
      ...(opts?.playerName
        ? { playerName: opts.playerName }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    serverId: r.serverId,
    playerName: r.playerName,
    uuid: r.uuid,
    action: r.action,
    reason: r.reason,
    actorUserId: r.actorUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}
