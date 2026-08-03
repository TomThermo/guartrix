import type { FastifyReply, FastifyRequest } from "fastify";
import {
  daemonJwtLegacyBearerEnabled,
  looksLikeJwt,
  safeEqualString,
  verifyDaemonJwt,
} from "@msm/shared/daemon-jwt";
import { daemonConfig } from "./config.js";
import { isMetricsTokenOrLocalhost } from "./metrics.js";

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function isDaemonAuthorized(request: FastifyRequest): boolean {
  const token = extractBearerToken(request);
  if (!token) return false;

  if (looksLikeJwt(token)) {
    if (!daemonConfig.nodeId) {
      // Without NODE_ID we still verify signature + aud; nid must be present.
      const claims = verifyDaemonJwt(token, daemonConfig.token, {
        aud: "daemon",
      });
      return Boolean(claims);
    }
    const claims = verifyDaemonJwt(token, daemonConfig.token, {
      aud: "daemon",
      nodeId: daemonConfig.nodeId,
    });
    return Boolean(claims);
  }

  if (!daemonJwtLegacyBearerEnabled()) return false;
  return safeEqualString(token, daemonConfig.token);
}

/** Auth middleware — skip /health and /ready; /metrics allows localhost or METRICS_TOKEN. */
export async function requireDaemonAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const pathOnly = request.url.split("?")[0] ?? "";
  if (pathOnly === "/health" || pathOnly === "/ready") return;
  if (pathOnly === "/metrics") {
    if (isMetricsTokenOrLocalhost(request) || isDaemonAuthorized(request)) {
      return;
    }
    return reply.status(401).send({ error: "Unauthorized" });
  }
  if (!isDaemonAuthorized(request)) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}
