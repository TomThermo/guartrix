/** Extract a safe error message for HTTP responses / UI. */
export function errorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}
