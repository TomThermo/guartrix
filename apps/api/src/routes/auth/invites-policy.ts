/**
 * Invite accept gate — matching email + emailVerified
 * (same bar as pending subuser auto-link in server-access).
 */
export function canAcceptInvite(opts: {
  sessionEmail: string | null | undefined;
  emailVerified: boolean | null | undefined;
  inviteEmail: string;
}): { ok: true } | { ok: false; reason: "email_mismatch" | "email_unverified" } {
  const email = opts.sessionEmail?.trim().toLowerCase() ?? "";
  const invite = opts.inviteEmail.trim().toLowerCase();
  if (!email || email !== invite) return { ok: false, reason: "email_mismatch" };
  if (!opts.emailVerified) return { ok: false, reason: "email_unverified" };
  return { ok: true };
}
