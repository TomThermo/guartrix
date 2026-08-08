import type { ApiEndpointDemo } from "./types";

/** Client API — account quotas (listed first in original catalog). */
export const ACCOUNT_PROFILE_DEMOS: ApiEndpointDemo[] = [
  {
    id: "account",
    group: "Client API",
    title: "Account quotas",
    description: "Current user quotas and active API key metadata (AuthUser — not contact profile).",
    method: "GET",
    path: "/api/account",
    auth: "gt",
    safe: true,
  },
  {
    id: "account-contact-profile",
    group: "Client API",
    title: "Contact profile",
    description: "Session-only name, email, phone, address (Account → Profile).",
    method: "GET",
    path: "/api/account/profile",
    auth: "session",
    safe: true,
    sampleResponse: {
      profile: {
        username: "steve",
        email: "steve@example.com",
        emailVerified: true,
        twoFactorEnabled: true,
        displayName: "Steve",
      },
    },
  },
  {
    id: "account-email-available",
    group: "Client API",
    title: "Email available?",
    description: "Live check whether an email can be claimed by this account.",
    method: "GET",
    path: "/api/account/email-available",
    auth: "session",
    query: "email=new@example.com",
    safe: true,
    sampleResponse: { available: true, own: false, valid: true },
  },
  {
    id: "account-profile-patch",
    group: "Client API",
    title: "Update contact profile",
    description: "PATCH contact fields. Returns 409 EMAIL_TAKEN if the email is used.",
    method: "PATCH",
    path: "/api/account/profile",
    auth: "session",
    body: { displayName: "Steve", email: "steve@example.com" },
    safe: false,
  },
  {
    id: "account-password-change",
    group: "Client API",
    title: "Change password",
    description: "current + new ×2; totpCode required when 2FA is on.",
    method: "POST",
    path: "/api/account/password",
    auth: "session",
    body: {
      currentPassword: "OldStr0ng!Pass",
      newPassword: "NewStr0ng!Pass",
      confirmPassword: "NewStr0ng!Pass",
      totpCode: "123456",
    },
    safe: false,
    sampleResponse: { ok: true },
  },
];

/** Client API — SFTP app passwords (listed after servers in original catalog). */
export const ACCOUNT_PASSWORD_DEMOS: ApiEndpointDemo[] = [
  {
    id: "account-app-passwords",
    group: "Client API",
    title: "List SFTP app passwords",
    description: "List gtap_ credentials for FileZilla / SFTP (not HTTP).",
    method: "GET",
    path: "/api/account/app-passwords",
    auth: "gt",
    safe: true,
  },
  {
    id: "account-app-password-create",
    group: "Client API",
    title: "Create SFTP app password",
    description: "Mint a one-time gtap_ token. Via API key, body must include your panel password.",
    method: "POST",
    path: "/api/account/app-passwords",
    auth: "gt",
    body: { name: "FileZilla", password: "YOUR_PANEL_PASSWORD" },
    safe: false,
    sampleResponse: {
      password: { id: "ap_…", name: "FileZilla", prefix: "gtap_…" },
      token: "gtap_…",
    },
  },
];

export const ACCOUNT_DEMOS: ApiEndpointDemo[] = [
  ...ACCOUNT_PROFILE_DEMOS,
  ...ACCOUNT_PASSWORD_DEMOS,
];
