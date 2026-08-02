import type { ActivityEventRecord } from "@msm/shared";
import { activityDetail } from "@msm/shared";
import { config } from "./config.js";
import { sendMail } from "./mail.js";

/**
 * Outbound alerts for critical activity (crashes, offline nodes, security events).
 * Configure with ACTIVITY_WEBHOOK_URL (Discord-compatible) and/or ALERT_EMAIL.
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
    const res = await fetch(url, {
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

/**
 * Send alerts for a critical activity event. Never throws; failures are logged
 * so a dead webhook can't break a power action.
 */
export async function notifyCriticalActivity(
  event: ActivityEventRecord,
): Promise<void> {
  const { webhookUrl, alertEmail, mutedActions } = config.alerts;
  if (!webhookUrl && !alertEmail) return;
  if (mutedActions.includes(event.action)) return;

  const key = `${event.action}:${event.serverId ?? event.userId ?? "global"}`;
  const now = Date.now();
  const previous = lastSent.get(key);
  if (previous && now - previous < DEDUPE_WINDOW_MS) return;
  lastSent.set(key, now);

  if (webhookUrl) {
    try {
      await postWebhook(webhookUrl, event);
    } catch (err) {
      console.warn(
        "[guartrix] Activity webhook failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (alertEmail) {
    try {
      await sendMail({
        to: alertEmail,
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
