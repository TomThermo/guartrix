import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission } from "@guartrix/shared";
import { assertAdminFullApiKey } from "../auth/auth.js";
import { errorMessage } from "../http-error.js";
import { processManager } from "../servers/process-manager.js";
import type { ServerSettingsPatch } from "../routes/servers/settings/schemas.js";
import { findUser } from "../repositories/users.js";

type Access = Awaited<ReturnType<typeof import("../auth/auth.js").requireServerAccess>>;

/** Returns true if the request may continue; otherwise a reply was already sent. */
export async function assertSettingsPatchAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  access: NonNullable<Access>,
  data: ServerSettingsPatch,
): Promise<boolean> {
  const server = access.server;

  const needsSettings =
    data.name !== undefined ||
    data.properties !== undefined ||
    data.port !== undefined ||
    data.diskMb !== undefined ||
    data.cpuLimit !== undefined ||
    data.ownerAlertWebhookUrl !== undefined ||
    data.ownerAlertEmail !== undefined ||
    data.discordStatusWebhookUrl !== undefined ||
    data.discordStatusEnabled !== undefined ||
    data.bluemapUrl !== undefined;
  const needsStartup =
    data.memoryMb !== undefined ||
    data.javaVersion !== undefined ||
    data.startupCommand !== undefined ||
    data.serverJar !== undefined ||
    data.autoRestart !== undefined ||
    data.startOnBoot !== undefined;

  if (needsSettings && !hasPermission(access.permissions, "settings.update")) {
    await reply.status(403).send({ error: "Missing permission" });
    return false;
  }
  if (needsStartup && !hasPermission(access.permissions, "startup.update")) {
    await reply.status(403).send({ error: "Missing permission" });
    return false;
  }

  if (data.extraMounts !== undefined) {
    if (access.user.role !== "ADMIN") {
      await reply.status(403).send({ error: "Only admins can change extra host mounts" });
      return false;
    }
    if (!assertAdminFullApiKey(request, reply)) return false;
  }

  if (data.ownerId !== undefined) {
    if (access.user.role !== "ADMIN") {
      await reply.status(403).send({ error: "Only admins can reassign ownership" });
      return false;
    }
    if (!assertAdminFullApiKey(request, reply)) return false;
    if (data.ownerId !== null) {
      const owner = await findUser({ where: { id: data.ownerId } });
      if (!owner) {
        await reply.status(400).send({ error: "Owner user not found" });
        return false;
      }
      if (data.ownerId !== server.ownerId) {
        try {
          const { assertCanAllocateMemory } = await import("../billing/quotas.js");
          await assertCanAllocateMemory(owner, data.memoryMb ?? server.memoryMb, {
            extraServer: true,
          });
        } catch (err) {
          await reply.status(403).send({ error: errorMessage(err) });
          return false;
        }
      }
    }
  }

  if (data.memoryMb !== undefined && data.memoryMb !== server.memoryMb) {
    if (access.user.role !== "ADMIN") {
      await reply.status(403).send({ error: "Only admins can change server memory" });
      return false;
    }
    if (!assertAdminFullApiKey(request, reply)) return false;
    const ownerId = data.ownerId !== undefined ? data.ownerId : server.ownerId;
    if (ownerId) {
      const owner =
        ownerId === access.user.id
          ? access.user
          : await findUser({ where: { id: ownerId } });
      if (owner) {
        try {
          const { assertCanAllocateMemory } = await import("../billing/quotas.js");
          await assertCanAllocateMemory(owner, data.memoryMb, {
            excludeServerId: server.id,
            diskMb: data.diskMb ?? server.diskMb,
          });
        } catch (err) {
          await reply.status(403).send({ error: errorMessage(err) });
          return false;
        }
      }
    }

    if (server.nodeId) {
      try {
        const { assertNodeCapacity } = await import("../nodes/nodes.js");
        await assertNodeCapacity(server.nodeId, data.memoryMb, {
          excludeServerId: server.id,
        });
      } catch (err) {
        await reply.status(403).send({ error: errorMessage(err) });
        return false;
      }
    }
  }

  if (data.diskMb !== undefined && data.diskMb !== server.diskMb) {
    if (access.user.role !== "ADMIN") {
      await reply.status(403).send({ error: "Only admins can change server disk quota" });
      return false;
    }
    if (!assertAdminFullApiKey(request, reply)) return false;
    try {
      const { assertLicenseDiskQuota } = await import("../license/license.js");
      await assertLicenseDiskQuota(data.diskMb);
    } catch (err) {
      await reply.status(403).send({ error: errorMessage(err) });
      return false;
    }
  }

  if (data.cpuLimit !== undefined && data.cpuLimit !== server.cpuLimit) {
    if (access.user.role !== "ADMIN") {
      await reply.status(403).send({ error: "Only admins can change server CPU limit" });
      return false;
    }
    if (!assertAdminFullApiKey(request, reply)) return false;
  }

  if (data.suspended !== undefined) {
    if (access.user.role !== "ADMIN") {
      await reply.status(403).send({ error: "Only admins can suspend servers" });
      return false;
    }
    if (!assertAdminFullApiKey(request, reply)) return false;
    if (data.suspended === true && processManager.isRunning(server.id)) {
      await processManager.stop(server.id);
    }
  }

  return true;
}

export function patchNeedsStartup(data: ServerSettingsPatch): boolean {
  return (
    data.memoryMb !== undefined ||
    data.javaVersion !== undefined ||
    data.startupCommand !== undefined ||
    data.serverJar !== undefined ||
    data.autoRestart !== undefined ||
    data.startOnBoot !== undefined
  );
}
