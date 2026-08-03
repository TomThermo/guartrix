import type { ActivityEventRecord } from "@msm/shared";
import { activityDetail } from "@msm/shared";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { sendMail } from "./mail.js";
import { assertSafeWebhookUrl } from "./safe-url.js";

/**
 * Outbound alerts for critical activity (crashes, offline nodes, security events).
 * Configure with ACTIVITY_WEBHOOK_URL (Discord-compatible) and/or ALERT_EMAIL.
 * Per-server owner webhook/email is also honored when set on the Server row.
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
  const safeUrl = await assertSafeWebhookUrl(url);
  const body = isDiscord(safeUrl)
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
    const res = await fetch(safeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) {
      throw new Error(`webhook responded ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send alerts for a critical activity event. Never throws; failures are logged
 * so a dead webhook can't break a power action.
 */
export async function notifyCriticalActivity(
  event: ActivityEventRecord,
): Promise<void> {
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

  if (!webhookUrl && !alertEmail && !ownerWebhook && !ownerEmail) return;

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
      console.warn(
        "[guartrix] Activity webhook failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const emails = [alertEmail, ownerEmail].filter(
    (u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i,
  );
  for (const to of emails) {
    try {
      await sendMail({
        to,
        subject: `[Guartrix] ${eventTitle(event)}`,
        text: eventLines(event).join("\n"),
      });
    } catch (err) {
      console.warn(
        "[guartrix] Activity alert email failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
