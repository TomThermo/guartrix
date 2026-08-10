import type { FastifyInstance, FastifyRequest } from "fastify";
import { syncMolliePayment } from "../../billing/billing-mollie-sync.js";
import { mollieConfigured } from "../../billing/mollie.js";
import { getRateLimitStore } from "../../rate-limit-store.js";
import { errorMessage } from "../../http-error.js";
import { findPayment } from "../../services/billing.js";
import {
  MOLLIE_WEBHOOK_MAX,
  MOLLIE_WEBHOOK_WINDOW_MS,
  mollieWebhookIpAllowed,
} from "./serialize.js";

function parseMollieId(body: unknown, request: FastifyRequest): string | null {
  let mollieId: string | null = null;
  if (body && typeof body === "object" && "id" in body) {
    const id = (body as { id: unknown }).id;
    if (typeof id === "string") mollieId = id;
  }
  if (!mollieId && typeof body === "string") {
    const params = new URLSearchParams(body);
    mollieId = params.get("id");
  }
  if (!mollieId) {
    const raw = request.body as { id?: string } | undefined;
    if (raw && typeof raw.id === "string") mollieId = raw.id;
  }
  return mollieId;
}

export function registerBillingMollieWebhookRoutes(app: FastifyInstance): void {
  app.post("/api/public/billing/mollie", async (request, reply) => {
    if (!mollieConfigured()) {
      return reply.status(503).send({ error: "Mollie not configured" });
    }

    const rl = await getRateLimitStore().hit(
      `mollie-webhook:${request.ip || "unknown"}`,
      MOLLIE_WEBHOOK_WINDOW_MS,
      MOLLIE_WEBHOOK_MAX,
    );
    if (rl.limited) {
      return reply.status(429).send({ error: "Too many webhook requests" });
    }

    if (!mollieWebhookIpAllowed(request.ip)) {
      return reply.status(403).send({ error: "Webhook source not allowed" });
    }

    const mollieId = parseMollieId(request.body, request);
    if (!mollieId?.startsWith("tr_")) {
      return reply.status(400).send({ error: "Missing Mollie payment id" });
    }

    const known = await findPayment({
      where: { mollieId },
      select: { id: true },
    });
    if (!known) {
      return { ok: true };
    }

    try {
      await syncMolliePayment(mollieId);
      return { ok: true };
    } catch (err) {
      const message = errorMessage(err);
      console.error("[billing] mollie webhook:", message);
      return { ok: false, error: message };
    }
  });
}
