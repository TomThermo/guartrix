import type { AuthUser, UserRole } from "@msm/shared";

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
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    twoFactorEnabled: false,
    twoFactorRequired: false,
    maxServers: user.role === "ADMIN" ? null : user.maxServers,
    maxMemoryMb: user.role === "ADMIN" ? null : user.maxMemoryMb,
    maxDatabases: user.role === "ADMIN" ? null : user.maxDatabases,
    serverCount: 0,
    memoryUsedMb: 0,
    databaseCount: 0,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}
