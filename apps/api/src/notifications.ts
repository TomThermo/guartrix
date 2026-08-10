import type { ActivityEventRecord } from "@guartrix/shared";
import { activityDetail } from "@guartrix/shared";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { sendMail, renderMail } from "./mail.js";
import { sendWebPushToUsers } from "./web-push.js";

/**
 * Outbound alerts for critical activity (crashes, offline nodes, security events).
 * Configure with ACTIVITY_WEBHOOK_URL (Discord-compatible) and/or ALERT_EMAIL.
 * Per-server owner webhook/email is also honored when set on the Server row.
 * Opt-in Web Push goes to the server owner (and admins for global events).
 */

/** Same action on the same target is only alerted once per window (crash loops). */
const DEDUPE_WINDOW_MS = 5 * 60_000;
const lastSent = new Map<string, number>();

function isDiscord(url: string): boolean {
  return /discord(app)?\.com\/api\/webhooks\//i.test(url);
}

function eventTitle(event: ActivityEventRecord): string {
  const where = event.serverName ? ` — ${event.serverName}` : "";
  return `${event.label}${where}`;
}

function eventLines(event: ActivityEventRecord): string[] {
  const lines = [eventTitle(event)];
  if (event.serverId) {
    lines.push(`Server: ${event.serverName ?? event.serverId} (${event.serverId})`);
  }
  lines.push(`Actor: ${event.actorName}${event.actorIp ? ` (${event.actorIp})` : ""}`);
  const detail = activityDetail(event);
  if (detail) lines.push(detail);
  lines.push(`When: ${event.createdAt}`);
  if (event.serverId) {
    lines.push(`${config.publicBaseUrl.replace(/\/$/, "")}/servers/${event.serverId}`);
  }
  return lines;
}

async function postWebhook(url: string, event: ActivityEventRecord): Promise<void> {
  const { fetchSafeWebhook } = await import("./safe-url.js");
  const body = isDiscord(url)
    ? {
        username: "Guartrix",
        embeds: [
          {
            title: eventTitle(event),
            description: eventLines(event).slice(1).join("\n"),
            color: event.success ? 0xd4a84b : 0xe07070,
            timestamp: event.createdAt,
          },
        ],
      }
    : {
        source: "guartrix",
        event,
        message: eventLines(event).join("\n"),
      };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // Validate Discord path + pin DNS inside fetchSafeWebhook
    const res = await fetchSafeWebhook(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`webhook responded ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function resolvePushUserIds(event: ActivityEventRecord): Promise<string[]> {
  if (event.serverId) {
    const row = await prisma.server
      .findUnique({
        where: { id: event.serverId },
        select: { ownerId: true },
      })
      .catch(() => null);
    return row?.ownerId ? [row.ownerId] : [];
  }
  // Global critical (license, etc.): notify admins who opted into push.
  const admins = await prisma.user.findMany({
    where: {
      role: "ADMIN",
      pushSubscriptions: { some: {} },
    },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/**
 * Send alerts for a critical activity event. Never throws; failures are logged
 * so a dead webhook can't break a power action.
 */
export async function notifyCriticalActivity(event: ActivityEventRecord): Promise<void> {
  const { webhookUrl, alertEmail, mutedActions } = config.alerts;
  if (mutedActions.includes(event.action)) return;

  let ownerWebhook: string | null = null;
  let ownerEmail: string | null = null;
  if (event.serverId) {
    const row = await prisma.server
      .findUnique({
        where: { id: event.serverId },
        select: {
          ownerAlertWebhookUrl: true,
          ownerAlertEmail: true,
        },
      })
      .catch(() => null);
    ownerWebhook = row?.ownerAlertWebhookUrl?.trim() || null;
    ownerEmail = row?.ownerAlertEmail?.trim() || null;
  }

  const pushUserIds = await resolvePushUserIds(event).catch(() => [] as string[]);
  const hasPushTargets = pushUserIds.length > 0;

  if (!webhookUrl && !alertEmail && !ownerWebhook && !ownerEmail && !hasPushTargets) {
    return;
  }

  const key = `${event.action}:${event.serverId ?? event.userId ?? "global"}`;
  const now = Date.now();
  // Crash-loop exhaustion must always alert (do not hide behind crash dedupe).
  const skipDedupe = event.action === "server.crash_loop";
  const previous = lastSent.get(key);
  if (!skipDedupe && previous && now - previous < DEDUPE_WINDOW_MS) return;
  lastSent.set(key, now);

  const webhooks = [webhookUrl, ownerWebhook].filter(
    (u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i,
  );
  for (const url of webhooks) {
    try {
      await postWebhook(url, event);
    } catch (err) {
      console.warn("[guartrix] Activity webhook failed:", err instanceof Error ? err.message : err);
    }
  }

  const emails = [alertEmail, ownerEmail].filter(
    (u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i,
  );
  for (const to of emails) {
    try {
      const mail = renderMail("alert", {
        eventTitle: eventTitle(event),
        eventBody: eventLines(event).join("\n"),
      });
      await sendMail({
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } catch (err) {
      console.warn(
        "[guartrix] Activity alert email failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (hasPushTargets) {
    const detail = activityDetail(event);
    const body =
      detail || (event.serverName ? `${event.label} on ${event.serverName}` : event.label);
    try {
      await sendWebPushToUsers(pushUserIds, {
        title: eventTitle(event),
        body: body.slice(0, 180),
        url: event.serverId
          ? `${config.publicBaseUrl.replace(/\/$/, "")}/servers/${event.serverId}`
          : config.publicBaseUrl,
        tag: key,
      });
    } catch (err) {
      console.warn("[guartrix] Web push alert failed:", err instanceof Error ? err.message : err);
    }
  }
}
