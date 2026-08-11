import { nanoid } from "nanoid";
import type { ServerType } from "@guartrix/shared";
import { primaryAllocationProtocol } from "@guartrix/shared";
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
  extraMounts?: import("@guartrix/shared").ServerExtraMount[] | null;
  /** Node storage pool id (null = DATA_DIR). */
  storageId?: string | null;
};

export type PanelCreateWorldOpts = {
  seed?: string;
  gamemode?: string;
  difficulty?: string;
  worldPreset?: string;
  keepCount?: number;
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

/** Progress text shown in the UI/console while status is CREATING. */
export async function setCreatingProgress(serverId: string, message: string): Promise<void> {
  await prisma.server
    .update({
      where: { id: serverId },
      data: { status: "CREATING", errorMessage: message },
    })
    .catch(() => undefined);
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

/**
 * Insert CREATING row + open primary port/allocation so the panel can navigate immediately.
 * Heavy prepare/start work continues in {@link finishPanelCreateInBackground}.
 */
export async function beginPanelServerCreate(input: ProvisionServerInput) {
  const id = input.id ?? nanoid(12);
  const diskMb = input.diskMb ?? 10_240;
  const cpuLimit = input.cpuLimit ?? 0;
  const protocol = primaryAllocationProtocol(input.type);

  await assertPortAvailable(input.port, input.nodeId, protocol);

  const { extraMountsForPrisma } = await import("./extra-mounts.js");

  if (input.storageId) {
    const { assertServerStorageAssignable } = await import("../services/node-storage.js");
    await assertServerStorageAssignable(input.nodeId, input.storageId);
  }

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
      errorMessage: "Creating: preparing…",
      startOnBoot: true,
      ownerId: input.ownerId,
      nodeId: input.nodeId,
      ...(input.storageId !== undefined ? { storageId: input.storageId } : {}),
      ...(input.extraMounts !== undefined
        ? { extraMounts: extraMountsForPrisma(input.extraMounts) }
        : {}),
    },
  });

  if (input.storageId) {
    const { syncServerStorageLocation } = await import("../services/node-storage.js");
    try {
      await syncServerStorageLocation(input.nodeId, id, input.storageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await cleanupFailedProvision(id, input.port, input.nodeId, protocol);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  try {
    await openFirewallPort(input.port, input.nodeId, protocol);
    await ensurePrimaryAllocation({
      serverId: id,
      nodeId: input.nodeId,
      port: input.port,
      protocol,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await cleanupFailedProvision(id, input.port, input.nodeId, protocol);
    throw err instanceof Error ? err : new Error(message);
  }

  const server = await prisma.server.findUniqueOrThrow({
    where: { id },
    include: serverListInclude,
  });
  return { id, server, protocol };
}

export type FinishPanelCreateOpts = {
  input: ProvisionServerInput;
  world?: PanelCreateWorldOpts;
  /** Activity log context (panel create). */
  activity?: {
    actorUserId: string;
    actorUsername: string;
    requestMeta?: Record<string, unknown>;
  };
};

/** Complete jar install / world defaults / autostart after a fast 201 response. */
export async function finishPanelCreateInBackground(opts: FinishPanelCreateOpts): Promise<void> {
  const { input, world } = opts;
  const id = input.id;
  if (!id) return;
  const protocol = primaryAllocationProtocol(input.type);

  try {
    const node = await prisma.node.findUnique({ where: { id: input.nodeId } });
    await setCreatingProgress(
      id,
      node && !node.isLocal
        ? "Creating: downloading server files & deploying to node…"
        : "Creating: downloading server files…",
    );

    const prepared = await prepareServerOnNode({
      serverId: id,
      nodeId: input.nodeId,
      type: input.type,
      mcVersion: input.mcVersion,
      port: input.port,
    });

    await setCreatingProgress(id, "Creating: applying world settings…");

    if (input.ensureSubdomain) {
      const subdomain = await maybeEnsureSubdomain(input.name, input.port);
      await prisma.server.update({
        where: { id },
        data: { subdomain },
      });
    }

    await prisma.server.update({
      where: { id },
      data: {
        paperBuild: prepared.paperBuild ?? null,
        fabricLoaderVersion: prepared.fabricLoaderVersion ?? null,
        forgeVersion: prepared.forgeVersion ?? null,
      },
    });

    try {
      const row = await prisma.server.findUniqueOrThrow({ where: { id } });
      await daemonSetLimits(id, {
        diskMb: row.diskMb,
        cpuLimit: row.cpuLimit,
      });
    } catch {
      // ignore
    }

    if (world) {
      const preset = world.worldPreset ?? "DEFAULT";
      const levelType = preset === "FLAT" ? "flat" : preset === "VOID" ? "flat" : undefined;
      const generatorSettings =
        preset === "VOID"
          ? JSON.stringify({
              layers: [{ block: "minecraft:air", height: 1 }],
              biome: "minecraft:the_void",
            })
          : undefined;
      const { applyCreateWorldDefaults } = await import("./server-lifecycle.js");
      await applyCreateWorldDefaults(id, {
        seed: world.seed,
        gamemode: world.gamemode,
        difficulty: world.difficulty,
        levelType,
        generatorSettings,
      }).catch((err) => {
        console.warn(
          `[guartrix] create world defaults failed for ${id}:`,
          err instanceof Error ? err.message : err,
        );
      });

      const { applyInitialBackupRetention } = await import("./backup-schedule.js");
      await applyInitialBackupRetention(id, world.keepCount);
    }

    if (opts.activity) {
      const { logActivity } = await import("../activity-log.js");
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id },
        include: serverListInclude,
      });
      logActivity({
        action: "server.create",
        user: { id: opts.activity.actorUserId, username: opts.activity.actorUsername },
        server: updated,
        metadata: {
          type: updated.type,
          mcVersion: updated.mcVersion,
          port: updated.port,
          memoryMb: updated.memoryMb,
          diskMb: updated.diskMb,
          node: input.nodeId,
          worldPreset: world?.worldPreset ?? "DEFAULT",
          ...(opts.activity.requestMeta ?? {}),
        },
      });
    }

    await setCreatingProgress(id, "Creating: starting…");
    await autoStartProvisionedServer(id);
    const after = await prisma.server.findUnique({
      where: { id },
      select: { status: true, errorMessage: true },
    });
    if (!after) return;
    if (after.status === "CREATING") {
      await prisma.server.update({
        where: { id },
        data: { status: "STOPPED", errorMessage: null },
      });
    } else if (after.errorMessage?.startsWith("Creating:")) {
      await prisma.server.update({
        where: { id },
        data: { errorMessage: null },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Prefer a short operator-facing message (daemon often wraps JSON `{ error: "…" }`).
    let display = message;
    try {
      const nested = JSON.parse(message) as { error?: unknown };
      if (typeof nested?.error === "string" && nested.error.trim()) display = nested.error.trim();
    } catch {
      const m = /"error"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(message);
      if (m?.[1]) {
        display = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
    console.error(`[guartrix] background create failed for ${id}: ${display}`);
    await prisma.server
      .update({
        where: { id },
        data: { status: "ERROR", errorMessage: display.slice(0, 2000) },
      })
      .catch(() => undefined);
    // Keep the ERROR row so the Console page can show the failure (async create UX).
    // Operators can delete the failed server from the UI.
    if (opts.activity) {
      const { logActivity } = await import("../activity-log.js");
      logActivity({
        action: "server.create",
        user: { id: opts.activity.actorUserId, username: opts.activity.actorUsername },
        serverId: id,
        serverName: input.name,
        success: false,
        metadata: { error: display, type: input.type, port: input.port },
      });
    }
  }
}

/** Synchronous provision (Application API / billing). */
export async function provisionPreparedServer(input: ProvisionServerInput) {
  const id = input.id ?? nanoid(12);
  const diskMb = input.diskMb ?? 10_240;
  const cpuLimit = input.cpuLimit ?? 0;
  const cleanupOnFailure = input.cleanupOnFailure !== false;
  const protocol = primaryAllocationProtocol(input.type);

  await assertPortAvailable(input.port, input.nodeId, protocol);

  const { extraMountsForPrisma } = await import("./extra-mounts.js");

  if (input.storageId) {
    const { assertServerStorageAssignable } = await import("../services/node-storage.js");
    await assertServerStorageAssignable(input.nodeId, input.storageId);
  }

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
      ...(input.storageId !== undefined ? { storageId: input.storageId } : {}),
      ...(input.extraMounts !== undefined
        ? { extraMounts: extraMountsForPrisma(input.extraMounts) }
        : {}),
    },
  });

  try {
    if (input.storageId) {
      const { syncServerStorageLocation } = await import("../services/node-storage.js");
      await syncServerStorageLocation(input.nodeId, id, input.storageId);
    }
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
