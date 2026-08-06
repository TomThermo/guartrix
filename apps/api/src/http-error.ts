/** Typed JSON error helpers for Client / Application API responses. */

export type ApiErrorBody = {
  error: string;
  code?: string;
  details?: unknown;
};

/** Extract a safe error message for HTTP responses / UI. */
export function errorMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/** Build a consistent `{ error, code?, details? }` payload. */
export function apiError(
  error: string,
  opts?: { code?: string; details?: unknown },
): ApiErrorBody {
  const body: ApiErrorBody = { error };
  if (opts?.code) body.code = opts.code;
  if (opts?.details !== undefined) body.details = opts.details;
  return body;
}

/**
 * Legacy Zod 400 shape used by most panel routes:
 * `{ error: ZodFlattenedError }`. Keep for API compatibility.
 */
export function sendZodError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  parsed: { error: { flatten: () => unknown } },
): unknown {
  return reply.status(400).send({ error: parsed.error.flatten() });
}

/** Map common Zod / Error failures into a status + envelope. */
export function fromZodOrError(
  err: unknown,
  fallback = "Invalid request",
): { status: number; body: ApiErrorBody } {
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name?: string }).name === "ZodError" &&
    "flatten" in err &&
    typeof (err as { flatten: () => unknown }).flatten === "function"
  ) {
    return {
      status: 400,
      body: apiError("Validation failed", {
        code: "VALIDATION_ERROR",
        details: (err as { flatten: () => unknown }).flatten(),
      }),
    };
  }
  return {
    status: 400,
    body: apiError(errorMessage(err, fallback), { code: "BAD_REQUEST" }),
  };
}
