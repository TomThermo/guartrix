import type { AuthMeResponse, AuthUser } from "@msm/shared";
import { request } from "./client";

export type AuthPublicConfig = {
  registrationEnabled: boolean;
  passwordMinLength: number;
  passwordPolicy: string;
  emailVerificationRequired?: boolean;
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string | null;
};

export const authApi = {
  me: () => request<AuthMeResponse>("/api/auth/me"),
  authConfig: () => request<AuthPublicConfig>("/api/auth/config"),
  login: (username: string, password: string, rememberMe = false, turnstileToken?: string) =>
    request<{
      ok: boolean;
      user?: AuthUser;
      requiresTwoFactor?: boolean;
      csrfToken?: string;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        rememberMe,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
    }),
  loginTwoFactor: (code: string) =>
    request<{ ok: boolean; user: AuthUser; csrfToken?: string }>("/api/auth/login/2fa", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getTwoFactor: () =>
    request<{
      enabled: boolean;
      required: boolean;
      pendingSetup: boolean;
      recoveryCodesRemaining: number;
    }>("/api/auth/2fa"),
  setupTwoFactor: () =>
    request<{ secret: string; otpauthUrl: string; secretGrouped: string }>("/api/auth/2fa/setup", {
      method: "POST",
      body: "{}",
    }),
  enableTwoFactor: (code: string) =>
    request<{ ok: boolean; recoveryCodes: string[] }>("/api/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  disableTwoFactor: (password: string, code: string) =>
    request<{ ok: boolean }>("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    }),
  cancelTwoFactorSetup: () =>
    request<{ ok: boolean }>("/api/auth/2fa/cancel", {
      method: "POST",
      body: "{}",
    }),
  regenerateRecoveryCodes: (password: string, code: string) =>
    request<{ ok: boolean; recoveryCodes: string[] }>("/api/auth/2fa/recovery", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    }),
  register: (body: {
    username: string;
    email: string;
    password: string;
    acceptTerms: true;
    turnstileToken?: string;
  }) =>
    request<{
      ok: boolean;
      user?: AuthUser;
      emailVerificationRequired?: boolean;
      message?: string;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean; message: string }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
