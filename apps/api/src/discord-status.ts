import { prisma } from "./db.js";
import { processManager } from "./servers/process-manager.js";
import { config } from "./config.js";
import { readServerProperties } from "./servers/properties.js";
import {
  fetchSafeOutbound,
  DISCORD_WEBHOOK_HOST_SUFFIXES,
} from "./safe-url.js";

const INTERVAL_MS = 60_000;

function isDiscordWebhook(url: string): boolean {
  return /discord(app)?\.com\/api\/webhooks\//i.test(url);
}

async function postOrEditStatus(opts: {
  webhookUrl: string;
  messageId: string | null;
  content: object;
}): Promise<string | null> {
  if (!isDiscordWebhook(opts.webhookUrl)) {
    throw new Error("Discord status requires a Discord webhook URL");
  }
  const base = opts.webhookUrl.replace(/\?.*$/, "").replace(/\/$/, "");
  const fetchOpts = {
    httpsOnly: true as const,
    allowedHostSuffixes: DISCORD_WEBHOOK_HOST_SUFFIXES,
  };

  if (opts.messageId) {
    const res = await fetchSafeOutbound(
      `${base}/messages/${opts.messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.content),
      },
      fetchOpts,
    );
    if (res.ok) return opts.messageId;
  }

  const res = await fetchSafeOutbound(
    `${base}?wait=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.content),
    },
    fetchOpts,
  );
  if (!res.ok) {
    throw new Error(`Discord status webhook ${res.status}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

async function tickOne(server: {
  id: string;
  name: string;
  port: number;
  status: string;
  mcVersion: string;
  subdomain: string | null;
  discordStatusWebhookUrl: string | null;
  discordStatusMessageId: string | null;
}): Promise<void> {
  const url = server.discordStatusWebhookUrl?.trim();
  if (!url) return;

  const props = await readServerProperties(server.id).catch(() => ({} as Record<string, string>));
  const maxPlayers = Number.parseInt(props["max-players"] ?? "20", 10) || 20;
  const online =
    server.status === "RUNNING"
      ? processManager.getOnlinePlayerNames(server.id).length
      : 0;

  let address = `${config.publicHost}:${server.port}`;
  if (server.subdomain && config.cloudflare.domain) {
    address = `${server.subdomain}.${config.cloudflare.domain}`;
  }

  const running = server.status === "RUNNING" || server.status === "STARTING";
  const color = running ? 0x3d9a6a : server.status === "ERROR" ? 0xe07070 : 0x888888;

  const body = {
    username: "Guartrix",
    embeds: [
      {
        title: server.name,
        color,
        fields: [
          { name: "Status", value: server.status, inline: true },
          {
            name: "Players",
            value: running ? `${online} / ${maxPlayers}` : `— / ${maxPlayers}`,
            inline: true,
          },
          { name: "Version", value: server.mcVersion, inline: true },
          { name: "Address", value: address, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const messageId = await postOrEditStatus({
    webhookUrl: url,
    messageId: server.discordStatusMessageId,
    content: body,
  });

  if (messageId && messageId !== server.discordStatusMessageId) {
    await prisma.server.update({
      where: { id: server.id },
      data: { discordStatusMessageId: messageId },
    });
  }
}

export function startDiscordStatusWorker(): void {
  const run = async () => {
    try {
      const servers = await prisma.server.findMany({
        where: {
          discordStatusEnabled: true,
          discordStatusWebhookUrl: { not: null },
        },
        select: {
          id: true,
          name: true,
          port: true,
          status: true,
          mcVersion: true,
          subdomain: true,
          discordStatusWebhookUrl: true,
          discordStatusMessageId: true,
        },
      });
      for (const s of servers) {
        try {
          await tickOne(s);
        } catch (err) {
          console.warn(
            `[guartrix] Discord status update failed for ${s.id}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch (err) {
      console.warn(
        "[guartrix] Discord status worker failed:",
        err instanceof Error ? err.message : err,
      );
    }
  };

  void run();
  setInterval(() => void run(), INTERVAL_MS);
}
