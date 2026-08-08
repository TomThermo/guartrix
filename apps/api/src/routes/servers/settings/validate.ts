import type { FastifyReply } from "fastify";
import type { ServerType } from "@msm/shared";
import { primaryAllocationProtocol } from "@msm/shared";
import {
  assertSafeBrowserUrl,
  assertSafeOutboundUrl,
  assertSafeWebhookUrl,
  DISCORD_WEBHOOK_HOST_SUFFIXES,
} from "../../../safe-url.js";
import { errorMessage } from "../../../http-error.js";
import { processManager } from "../../../servers/process-manager.js";
import { updateServerProperties } from "../../../servers/properties.js";
import type { ServerSettingsPatch } from "./schemas.js";

type ServerRow = {
  id: string;
  type: string;
  port: number;
  nodeId: string | null;
  memoryMb: number;
  serverJar: string | null;
  startupCommand: string | null;
  status: string;
};

export type NormalizedSettingsFields = {
  portChanging: boolean;
  portProtocol: ReturnType<typeof primaryAllocationProtocol>;
  nextJavaPath: string | null | undefined;
  nextServerJar: string | null | undefined;
  ownerAlertWebhookUrl: string | null | undefined;
  discordStatusWebhookUrl: string | null | undefined;
  bluemapUrl: string | null | undefined;
  nextExtraMounts: import("@msm/shared").ServerExtraMount[] | null | undefined;
};

/** Validate port/startup/jar/URLs and apply property file updates. Returns null if reply sent. */
export async function validateAndNormalizeSettingsPatch(
  reply: FastifyReply,
  server: ServerRow,
  data: ServerSettingsPatch,
): Promise<NormalizedSettingsFields | null> {
  const portChanging = data.port !== undefined && data.port !== server.port;
  const portProtocol = primaryAllocationProtocol(server.type as ServerType);

  if (portChanging) {
    if (processManager.isRunning(server.id) || server.status === "RUNNING") {
      await reply.status(409).send({ error: "Stop the server before changing the port" });
      return null;
    }
    const free = await processManager.isPortFree(
      data.port!,
      server.id,
      server.nodeId,
      portProtocol,
    );
    if (!free) {
      await reply.status(409).send({
        error: `Port ${data.port}/${portProtocol} is already in use`,
      });
      return null;
    }
  }

  if (data.properties || data.port !== undefined) {
    await updateServerProperties(server.id, data.properties ?? {}, data.port);
  }

  // javaVersion is stored in the javaPath DB column (major version string).
  let nextJavaPath: string | null | undefined;
  if (data.javaVersion !== undefined) {
    nextJavaPath = data.javaVersion;
  }

  if (data.startupCommand !== undefined && data.startupCommand !== null) {
    const trimmed = data.startupCommand.trim();
    if (trimmed) {
      try {
        const {
          resolveStartupCommand,
          startupCommandToArgs,
          normalizeServerExecutable,
          assertSafeStartupCommandForType,
        } = await import("@msm/shared");
        const jar = normalizeServerExecutable(
          data.serverJar !== undefined ? data.serverJar : server.serverJar,
          server.type as ServerType,
        );
        const mem = data.memoryMb ?? server.memoryMb;
        startupCommandToArgs(resolveStartupCommand(trimmed, mem, jar));
        assertSafeStartupCommandForType(server.type as ServerType, trimmed, mem, jar);
      } catch (err) {
        await reply.status(400).send({ error: `Invalid startup command: ${errorMessage(err)}` });
        return null;
      }
    }
  } else if (
    data.memoryMb !== undefined &&
    data.memoryMb !== server.memoryMb &&
    server.startupCommand?.trim()
  ) {
    // Memory lowered/changed — existing hard-coded -Xmx must still fit.
    try {
      const { assertSafeStartupCommandForType, normalizeServerExecutable } = await import(
        "@msm/shared"
      );
      assertSafeStartupCommandForType(
        server.type as ServerType,
        server.startupCommand,
        data.memoryMb,
        normalizeServerExecutable(
          data.serverJar !== undefined ? data.serverJar : server.serverJar,
          server.type as ServerType,
        ),
      );
    } catch (err) {
      await reply.status(400).send({
        error: `Cannot set memory: startup command heap exceeds new limit. ${errorMessage(err)}`,
      });
      return null;
    }
  }

  let nextServerJar: string | null | undefined;
  if (data.serverJar !== undefined) {
    if (data.serverJar === null || !data.serverJar.trim()) {
      nextServerJar = null;
    } else {
      try {
        const { normalizeServerExecutable } = await import("@msm/shared");
        nextServerJar = normalizeServerExecutable(data.serverJar, server.type as ServerType);
      } catch (err) {
        await reply.status(400).send({ error: errorMessage(err) });
        return null;
      }
    }
  }

  let ownerAlertWebhookUrl: string | null | undefined =
    data.ownerAlertWebhookUrl === undefined
      ? undefined
      : data.ownerAlertWebhookUrl === null || data.ownerAlertWebhookUrl === ""
        ? null
        : data.ownerAlertWebhookUrl.trim();
  let discordStatusWebhookUrl: string | null | undefined =
    data.discordStatusWebhookUrl === undefined
      ? undefined
      : data.discordStatusWebhookUrl === null || data.discordStatusWebhookUrl === ""
        ? null
        : data.discordStatusWebhookUrl.trim();
  let bluemapUrl: string | null | undefined =
    data.bluemapUrl === undefined
      ? undefined
      : data.bluemapUrl === null || data.bluemapUrl === ""
        ? null
        : data.bluemapUrl.trim();

  let nextExtraMounts: import("@msm/shared").ServerExtraMount[] | null | undefined;
  if (data.extraMounts !== undefined) {
    try {
      const { parseExtraMounts } = await import("../../../servers/extra-mounts.js");
      nextExtraMounts = parseExtraMounts(data.extraMounts);
    } catch (err) {
      await reply.status(400).send({
        error: err instanceof Error ? err.message : "Invalid extraMounts",
      });
      return null;
    }
  }

  try {
    if (typeof ownerAlertWebhookUrl === "string") {
      ownerAlertWebhookUrl = await assertSafeWebhookUrl(ownerAlertWebhookUrl);
    }
    if (typeof discordStatusWebhookUrl === "string") {
      discordStatusWebhookUrl = await assertSafeOutboundUrl(discordStatusWebhookUrl, {
        httpsOnly: true,
        allowedHostSuffixes: DISCORD_WEBHOOK_HOST_SUFFIXES,
      });
    }
    if (typeof bluemapUrl === "string") {
      bluemapUrl = assertSafeBrowserUrl(bluemapUrl);
    }
  } catch (err) {
    await reply.status(400).send({
      error: err instanceof Error ? err.message : "Invalid URL",
    });
    return null;
  }

  return {
    portChanging,
    portProtocol,
    nextJavaPath,
    nextServerJar,
    ownerAlertWebhookUrl,
    discordStatusWebhookUrl,
    bluemapUrl,
    nextExtraMounts,
  };
}
