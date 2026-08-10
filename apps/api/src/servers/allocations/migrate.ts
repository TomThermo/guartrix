import { prisma } from "../../db.js";
import { closeFirewallPort, openFirewallPort } from "../../nodes/firewall.js";
import { ensurePrimaryAllocation } from "./ensure.js";
import { readServerProperties, updateServerProperties } from "../properties.js";

export async function migratePrimaryAllocations(): Promise<number> {
  const { primaryAllocationProtocol } = await import("@guartrix/shared");
  const servers = await prisma.server.findMany({
    where: { nodeId: { not: null } },
    select: { id: true, nodeId: true, port: true, type: true },
  });
  let n = 0;
  for (const s of servers) {
    if (!s.nodeId) continue;
    const has = await prisma.allocation.findFirst({
      where: { serverId: s.id, isPrimary: true },
    });
    if (has) continue;
    try {
      await ensurePrimaryAllocation({
        serverId: s.id,
        nodeId: s.nodeId,
        port: s.port,
        protocol: primaryAllocationProtocol(s.type),
      });
      n += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[guartrix] Could not backfill allocation for ${s.id}: ${msg}`);
    }
  }
  return n;
}

/** Restore BDS online-mode for Xbox verification (undo offline-only migration). */
export async function migrateBdsBootProperties(): Promise<number> {
  const servers = await prisma.server.findMany({
    where: { type: { in: ["BEDROCK", "BEDROCK_PREVIEW"] } },
    select: { id: true },
  });
  let n = 0;
  for (const s of servers) {
    try {
      const props = await readServerProperties(s.id);
      if (props["online-mode"] !== "false") continue;
      await updateServerProperties(s.id, { "online-mode": "true" });
      n += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[guartrix] BDS boot property migration skipped for ${s.id}: ${msg}`);
    }
  }
  return n;
}

/** Fix Bedrock servers whose primary allocation or firewall still use TCP. */
export async function migrateBedrockAllocationProtocols(): Promise<number> {
  const { primaryAllocationProtocol } = await import("@guartrix/shared");
  const servers = await prisma.server.findMany({
    where: {
      nodeId: { not: null },
      type: { in: ["BEDROCK", "BEDROCK_PREVIEW", "POCKETMINE", "NUKKIT"] },
    },
    select: { id: true, nodeId: true, port: true, type: true },
  });
  let n = 0;
  for (const s of servers) {
    if (!s.nodeId) continue;
    const want = primaryAllocationProtocol(s.type);
    if (want !== "udp") continue;
    const primary = await prisma.allocation.findFirst({
      where: { serverId: s.id, isPrimary: true },
    });
    if (primary?.protocol === want) continue;
    try {
      await ensurePrimaryAllocation({
        serverId: s.id,
        nodeId: s.nodeId,
        port: s.port,
        protocol: want,
      });
      await openFirewallPort(s.port, s.nodeId, want).catch(() => undefined);
      if (primary?.protocol === "tcp") {
        await closeFirewallPort(s.port, s.nodeId, "tcp").catch(() => undefined);
      }
      n += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[guartrix] Could not fix Bedrock allocation for ${s.id}: ${msg}`);
    }
  }
  return n;
}
