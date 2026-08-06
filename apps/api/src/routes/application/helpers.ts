import type { AuthUser, UserRole } from "@msm/shared";
import { displayQuotasForRole } from "../../auth/user-quotas.js";

export function toAppUser(user: {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  maxServers: number | null;
  maxMemoryMb: number | null;
  maxDatabases: number | null;
  email: string | null;
  emailVerified: boolean;
}): AuthUser & { email: string | null; emailVerified: boolean } {
  const quotas = displayQuotasForRole(user.role, user);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: false,
    twoFactorRequired: false,
    maxServers: quotas.maxServers,
    maxMemoryMb: quotas.maxMemoryMb,
    maxDatabases: quotas.maxDatabases,
    serverCount: 0,
    memoryUsedMb: 0,
    databaseCount: 0,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}
