/** Domain error that route handlers map to HTTP status + JSON body. */
export class ServiceError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, opts?: { code?: string }) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = opts?.code;
  }

  toJSON(): { error: string; code?: string } {
    return this.code ? { error: this.message, code: this.code } : { error: this.message };
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}
