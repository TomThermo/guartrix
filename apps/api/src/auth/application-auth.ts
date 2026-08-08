import type { FastifyReply, FastifyRequest } from "fastify";
import {
  applicationHasScope,
  applicationRateLimitedMessage,
  resolveApplicationAuth,
  type ApplicationAuthContext,
} from "./application-keys.js";

/** Require a valid Application API key with the given scope. */
export async function requireApplication(
  request: FastifyRequest,
  reply: FastifyReply,
  scope: string,
): Promise<ApplicationAuthContext | null> {
  const ctx = await resolveApplicationAuth(request);
  if (!ctx) {
    const rate = applicationRateLimitedMessage(request);
    if (rate) {
      const { rateLimitedError } = await import("../http-error.js");
      reply.status(429).send(rateLimitedError(rate));
      return null;
    }
    reply
      .status(401)
      .send({ error: "Invalid or missing Application API key", code: "UNAUTHORIZED" });
    return null;
  }
  if (!applicationHasScope(ctx, scope)) {
    reply.status(403).send({
      error: `Missing Application API scope: ${scope}`,
      code: "FORBIDDEN",
    });
    return null;
  }
  return ctx;
}
