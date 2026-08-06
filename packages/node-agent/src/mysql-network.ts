import { docker } from "./docker.js";

export const MYSQL_CONTAINER = "guartrix-mysql";
export const GUARTRIX_NETWORK = "guartrix";

export function mysqlRootPassword(): string {
  const existing = process.env.MYSQL_ROOT_PASSWORD?.trim();
  if (existing) return existing;
  throw new Error(
    "MYSQL_ROOT_PASSWORD is not set — restart the panel/daemon to bootstrap it",
  );
}

export async function waitForMysqlReady(timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  let lastError = "timeout";
  while (Date.now() - started < timeoutMs) {
    try {
      await docker(
        [
          "exec",
          MYSQL_CONTAINER,
          "mysqladmin",
          "ping",
          "-h",
          "127.0.0.1",
          "-uroot",
          `-p${mysqlRootPassword()}`,
          "--silent",
        ],
        { timeout: 10_000 },
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`MySQL container did not become ready: ${lastError}`);
}

export async function ensureGuartrixNetwork(): Promise<void> {
  try {
    await docker(["network", "inspect", GUARTRIX_NETWORK], { timeout: 10_000 });
  } catch {
    await docker(["network", "create", GUARTRIX_NETWORK], { timeout: 15_000 });
  }
}

/** `shared` = flat `guartrix` bridge; `per_server` = isolated game network + shared DB attach. */
export function dockerNetworkMode(): "shared" | "per_server" {
  const raw = (process.env.DOCKER_NETWORK_MODE ?? "per_server").trim().toLowerCase();
  if (raw === "shared") {
    if (process.env.ALLOW_SHARED_DOCKER_NETWORK !== "1") {
      console.warn(
        "[guartrix] DOCKER_NETWORK_MODE=shared ignored — set ALLOW_SHARED_DOCKER_NETWORK=1 to enable flat bridge",
      );
      return "per_server";
    }
    return "shared";
  }
  return "per_server";
}

/** Docker network name for a game server when DOCKER_NETWORK_MODE=per_server. */
export function serverNetworkName(serverId: string): string {
  const short =
    serverId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase() || "unknown";
  return `guartrix-s-${short}`;
}

export async function ensureServerNetwork(serverId: string): Promise<string> {
  const name = serverNetworkName(serverId);
  try {
    await docker(["network", "inspect", name], { timeout: 10_000 });
  } catch {
    await docker(["network", "create", "--label", "guartrix=1", name], {
      timeout: 15_000,
    });
  }
  return name;
}

/**
 * Resolve the primary Docker network for a game container.
 * Always ensures the shared `guartrix` bridge exists (MySQL lives there).
 */
export async function resolveGameNetwork(serverId: string): Promise<{
  primary: string;
  attachSharedDb: boolean;
}> {
  await ensureGuartrixNetwork();
  if (dockerNetworkMode() === "per_server") {
    const primary = await ensureServerNetwork(serverId);
    return { primary, attachSharedDb: true };
  }
  return { primary: GUARTRIX_NETWORK, attachSharedDb: false };
}

/** Attach a running container to the shared MySQL bridge (idempotent). */
export async function connectContainerToSharedNetwork(
  containerName: string,
): Promise<void> {
  await ensureGuartrixNetwork();
  try {
    await docker(["network", "connect", GUARTRIX_NETWORK, containerName], {
      timeout: 15_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Already attached
    if (/already (exists|connected)|endpoint with name/i.test(msg)) return;
    throw err;
  }
}
