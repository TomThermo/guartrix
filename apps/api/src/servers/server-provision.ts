import { nanoid } from "nanoid";
import type { ServerType } from "@msm/shared";
import { primaryAllocationProtocol } from "@msm/shared";
import { ensurePrimaryAllocation } from "./allocations.js";
import { config } from "../config.js";
import { daemonSetLimits } from "../nodes/daemon-client.js";
import { prisma } from "../db.js";
import { closeFirewallPort, openFirewallPort } from "../nodes/firewall.js";
import { processManager } from "./process-manager.js";
import { prepareServerOnNode, wipeServerEverywhere } from "./server-files.js";
import { serverListInclude } from "./serialize.js";

export type ProvisionServerInput = {
  name: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  memoryMb: number;
  diskMb?: number;
  cpuLimit?: number;
  ownerId: string;
  nodeId: string;
  /** Create Cloudflare subdomain from the server name when configured. */
  ensureSubdomain?: boolean;
  /**
   * On prepare failure: wipe files, delete DB row, close firewall.
   * Panel create defaults to true; Application API historically left the ERROR row.
   */
  cleanupOnFailure?: boolean;
  /** Optional fixed id (tests / billing). */
  id?: string;
  /** Extra Docker binds (already validated). */
  extraMounts?: import("@msm/shared").ServerExtraMount[] | null;
};

/** Shared failure cleanup used by create + clone. */
export async function cleanupFailedProvision(
  serverId: string,
  port: number,
  nodeId: string,
  protocol: "tcp" | "udp" = "tcp",
): Promise<void> {
  await wipeServerEverywhere(serverId).catch(() => undefined);
  await prisma.server.delete({ where: { id: serverId } }).catch(() => undefined);
  await closeFirewallPort(port, nodeId, protocol).catch(() => undefined);
}

export async function assertPortAvailable(
  port: number,
  nodeId: string,
  protocol: "tcp" | "udp" = "tcp",
): Promise<void> {
  const portFree = await processManager.isPortFree(port, undefined, nodeId, protocol);
  if (!portFree) {
    throw new Error(`Port ${port}/${protocol} is already in use`);
  }
}

async function maybeEnsureSubdomain(name: string, port: number): Promise<string | null> {
  try {
    const { ensureServerSubdomain, cloudflareConfigured } = await import(
      "../nodes/cloudflare-dns.js"
    );
    if (!cloudflareConfigured()) return null;
    const { hostPublicIp } = await import("../nodes/host-resources.js");
    const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(config.publicHost)
      ? config.publicHost
      : hostPublicIp();
    if (!ipv4) throw new Error("No public IPv4 available for Cloudflare A record");
    const dns = await ensureServerSubdomain({
      preferredSlug: name,
      port,
      ipv4,
    });
    return dns?.slug ?? null;
  } catch (dnsErr) {
    const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
    console.warn(`[guartrix] Cloudflare subdomain failed: ${msg}`);
    return null;
  }
}

/** Attempt Cloudflare subdomain; returns slug or null (never throws). */
export async function tryEnsureServerSubdomain(name: string, port: number): Promise<string | null> {
  return maybeEnsureSubdomain(name, port);
}

/** Start a freshly provisioned server (create / import / clone). Logs and skips on license errors. */
export async function autoStartProvisionedServer(serverId: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return;
  try {
    const {
      assertLicenseAllowsPower,
      assertLicensePanelQuota,
      assertLicenseDiskQuota,
      startServerIfLicensed,
    } = await import("../license/license.js");
    await assertLicenseAllowsPower();
    await assertLicensePanelQuota(server.memoryMb, { excludeServerId: serverId });
    await assertLicenseDiskQuota(server.diskMb);
    const { openServerAllocationFirewalls } = await import("./allocations.js");
    await openServerAllocationFirewalls(serverId, server.nodeId);
    await prisma.server.update({
      where: { id: serverId },
      data: { stoppedByUser: false },
    });
    await startServerIfLicensed(serverId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[guartrix] auto-start after provision failed for ${serverId}: ${message}`);
  }
}

export async function provisionPreparedServer(input: ProvisionServerInput) {
  const id = input.id ?? nanoid(12);
  const diskMb = input.diskMb ?? 10_240;
  const cpuLimit = input.cpuLimit ?? 0;
  const cleanupOnFailure = input.cleanupOnFailure !== false;
  const protocol = primaryAllocationProtocol(input.type);

  await assertPortAvailable(input.port, input.nodeId, protocol);

  const { extraMountsForPrisma } = await import("./extra-mounts.js");

  await prisma.server.create({
    data: {
      id,
      name: input.name,
      type: input.type,
      mcVersion: input.mcVersion,
      port: input.port,
      memoryMb: input.memoryMb,
      diskMb,
      cpuLimit,
      status: "CREATING",
      startOnBoot: true,
      ownerId: input.ownerId,
      nodeId: input.nodeId,
      ...(input.extraMounts !== undefined
        ? { extraMounts: extraMountsForPrisma(input.extraMounts) }
        : {}),
    },
  });

  try {
    await openFirewallPort(input.port, input.nodeId, protocol);
    await ensurePrimaryAllocation({
      serverId: id,
      nodeId: input.nodeId,
      port: input.port,
      protocol,
    });

    const prepared = await prepareServerOnNode({
      serverId: id,
      nodeId: input.nodeId,
      type: input.type,
      mcVersion: input.mcVersion,
      port: input.port,
    });

    const subdomain = input.ensureSubdomain
      ? await maybeEnsureSubdomain(input.name, input.port)
      : null;

    const updated = await prisma.server.update({
      where: { id },
      data: {
        status: "STOPPED",
        paperBuild: prepared.paperBuild ?? null,
        fabricLoaderVersion: prepared.fabricLoaderVersion ?? null,
        forgeVersion: prepared.forgeVersion ?? null,
        errorMessage: null,
        ...(input.ensureSubdomain ? { subdomain } : {}),
      },
      include: serverListInclude,
    });

    try {
      await daemonSetLimits(id, {
        diskMb: updated.diskMb,
        cpuLimit: updated.cpuLimit,
      });
    } catch {
      // ignore
    }

    return { id, server: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.server
      .update({
        where: { id },
        data: { status: "ERROR", errorMessage: message },
      })
      .catch(() => undefined);
    if (cleanupOnFailure) {
      await cleanupFailedProvision(id, input.port, input.nodeId, protocol);
    }
    throw err instanceof Error ? err : new Error(message);
  }
}
