export type UserRole = "ADMIN" | "OPERATOR" | "VIEWER";

/** Human-readable role labels for the UI. */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "OPERATOR":
      return "User";
    case "VIEWER":
      return "Viewer";
  }
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  /** Max owned servers; null = unlimited. Admins are always unlimited. */
  maxServers: number | null;
  /** Total RAM pool (MB) across owned servers; null = unlimited. */
  maxMemoryMb: number | null;
  /** Max MySQL databases across owned servers; null = unlimited. */
  maxDatabases: number | null;
  serverCount?: number;
  /** Sum of memoryMb on owned servers. */
  memoryUsedMb?: number;
  /** Databases owned via this user's servers. */
  databaseCount?: number;
  /** TOTP two-factor auth is active on this account. */
  twoFactorEnabled?: boolean;
  /** This role must have 2FA (TWO_FACTOR_REQUIRED_ROLES); UI forces setup. */
  twoFactorRequired?: boolean;
}

/** Whether this user may create/import/clone another server under their quota. */
export function canCreateServer(user: AuthUser | null | undefined): boolean {
  if (!user || user.role === "VIEWER") return false;
  if (user.role === "ADMIN" || user.maxServers == null) return true;
  if (user.maxServers <= 0) return false;
  if (user.maxMemoryMb === 0) return false;
  return (user.serverCount ?? 0) < user.maxServers;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: AuthUser | null;
  csrfToken?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: UserRole;
  maxServers?: number | null;
  maxMemoryMb?: number | null;
  maxDatabases?: number | null;
}

export interface UpdateUserRequest {
  password?: string;
  role?: UserRole;
  maxServers?: number | null;
  maxMemoryMb?: number | null;
  maxDatabases?: number | null;
  /** Admin only: wipe the user's TOTP so they can re-enrol. */
  disableTwoFactor?: true;
}

export interface ServerSubUser {
  id: string;
  serverId: string;
  email: string;
  userId: string | null;
  username: string | null;
  permissions: string[];
  /** True when a pending invite token exists. */
  invitePending?: boolean;
  inviteExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubUserRequest {
  email: string;
  permissions: string[];
}

export interface UpdateSubUserRequest {
  permissions: string[];
}

export interface CreateSubUserResponse {
  subuser: ServerSubUser;
  /** True when a new panel account was created (password set via invite email). */
  accountCreated?: boolean;
  /** Absolute invite URL (shown once / on resend). */
  inviteUrl?: string;
}

/** Self-serve contact / billing profile (Account → Profile). */
export interface AccountProfile {
  username: string;
  email: string | null;
  emailVerified: boolean;
  /** Whether TOTP is enabled (needed for password change). */
  twoFactorEnabled: boolean;
  displayName: string | null;
  phoneCountry: string | null;
  phoneNational: string | null;
  phoneE164: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  addressLat: number | null;
  addressLon: number | null;
  addressVerifiedAt: string | null;
}

export interface UpdateAccountProfileRequest {
  email?: string | null;
  displayName?: string | null;
  phoneCountry?: string | null;
  phoneNational?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  /** When set from address suggest, marks address as checked. */
  addressLat?: number | null;
  addressLon?: number | null;
  clearAddressVerification?: boolean;
}

export interface ChangeAccountPasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  /** Required when two-factor is enabled. */
  totpCode?: string;
}

export interface AddressSuggestItem {
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  addressCity: string;
  addressPostalCode: string;
  addressCountry: string;
  lat: number;
  lon: number;
}
