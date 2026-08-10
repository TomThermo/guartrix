import type { AuthUser, UserRole } from "@guartrix/shared";

declare module "fastify" {
  interface Session {
    authenticated?: boolean;
    userId?: string;
    rememberMe?: boolean;
    /** Password accepted, waiting for the TOTP/recovery code. */
    pendingTwoFactorUserId?: string;
    pendingRememberMe?: boolean;
  }
  interface FastifyRequest {
    /** Request-scoped cache for getSessionUser. */
    authUserCache?: AuthUser | null;
    authUserCacheLoaded?: boolean;
  }
}

export type { AuthUser, UserRole };
