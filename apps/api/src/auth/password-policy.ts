/**
 * Password strength checks shared by register, reset, and admin user create/update.
 * Existing hashes are never revalidated — only newly submitted passwords.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordPolicyMessage(): string {
  return `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters and include uppercase, lowercase, a number, and a symbol.`;
}

export function isStrongPassword(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return false;
  }
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

/** Zod refine-compatible helper. */
export function strongPasswordRefine(password: string): boolean {
  return isStrongPassword(password);
}
