import type { ActivityQuery } from "@msm/shared";

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Register a callback when any API call returns 401. Returns unsubscribe. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

/**
 * Backup transfers stay same-origin (Vite / prod-web stream-proxy to the API).
 * Cross-origin :3001 caused cookie/CORS issues and fake progress on rejected sockets.
 */
export function transferUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function activityQueryString(query: ActivityQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null | undefined): void {
  csrfToken = token?.trim() ? token.trim() : null;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (init?.method ?? "GET").toUpperCase();
  if (csrfToken && MUTATING.has(method) && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", csrfToken);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw err;
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Expired/missing session → send UI back to login (skip failed login attempts)
    if (res.status === 401 && !url.includes("/api/auth/")) {
      notifyUnauthorized();
    }
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error
          ? JSON.stringify(data.error)
          : res.statusText;
    const code = typeof data.code === "string" ? data.code : undefined;
    throw new ApiError(message, res.status, code);
  }
  return data as T;
}
