import webpush from "web-push";
import { prisma } from "./db.js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let configured = false;

function vapidPublic(): string {
  return (process.env.VAPID_PUBLIC_KEY ?? "").trim();
}

function vapidPrivate(): string {
  return (process.env.VAPID_PRIVATE_KEY ?? "").trim();
}

function vapidSubject(): string {
  const raw = (process.env.VAPID_SUBJECT ?? "").trim();
  if (raw) return raw;
  const host = (process.env.PUBLIC_HOST ?? "localhost").trim() || "localhost";
  return `mailto:noreply@${host.replace(/^https?:\/\//, "")}`;
}

/** True when both VAPID keys are set (push sending is possible). */
export function isWebPushConfigured(): boolean {
  return Boolean(vapidPublic() && vapidPrivate());
}

function ensureWebPush(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(vapidSubject(), vapidPublic(), vapidPrivate());
    configured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  const key = vapidPublic();
  return key || null;
}

/** Send a notification to every stored subscription for the given user ids. */
export async function sendWebPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!ensureWebPush()) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;

  const rows = await prisma.pushSubscription.findMany({
    where: { userId: { in: unique } },
  });
  if (rows.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          { TTL: 60 * 60 },
        );
      } catch (err) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        // Gone / expired subscription — drop it.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: row.id } })
            .catch(() => undefined);
          return;
        }
        console.warn(
          "[guartrix] Web push failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}
