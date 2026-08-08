/**
 * Stop / kill / command-send paths for a managed server process. Extracted
 * from process-manager.ts so that file can stay focused on start/attach
 * orchestration and console/status bookkeeping.
 *
 * These functions operate on a `LifecycleHost` — the small slice of
 * ProcessManager's own state and helper methods they need — rather than a
 * concrete class, so ProcessManager can stay the single source of truth for
 * that state while delegating the actual stop/kill/command logic here.
 */
import type { ServerStatus } from "@msm/shared";
import { containerName, docker, removeContainer } from "./docker.js";
import type { ManagedProcess } from "./process-types.js";

const STOP_TIMEOUT_MS = 20_000;

export interface LifecycleHost {
  readonly processes: Map<string, ManagedProcess>;
  readonly intentionalStops: Set<string>;
  readonly restartAttempts: Map<string, { count: number; at: number }>;
  daemonSay(serverId: string, message: string): void;
  setStatus(serverId: string, status: ServerStatus, errorMessage?: string | null): void;
  persistHistory(serverId: string): void;
  adoptRunning(serverId: string): Promise<boolean>;
}

export async function stopProcess(host: LifecycleHost, serverId: string): Promise<void> {
  const managed = host.processes.get(serverId);
  const name = managed?.container ?? containerName(serverId);

  host.intentionalStops.add(serverId);
  host.restartAttempts.delete(serverId);

  if (!managed) {
    host.daemonSay(serverId, "Server marked as OFF");
    await removeContainer(serverId);
    host.setStatus(serverId, "STOPPED", null);
    host.intentionalStops.delete(serverId);
    return;
  }

  host.setStatus(serverId, "STOPPING");
  host.daemonSay(serverId, "Server marked as STOPPING");

  try {
    managed.process.stdin.write("stop\n");
  } catch {
    // ignore
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      void docker(["stop", "-t", "5", name]).finally(() => {
        try {
          managed.process.kill("SIGTERM");
        } catch {
          // ignore
        }
        setTimeout(() => {
          void removeContainer(serverId).finally(resolve);
        }, 2000);
      });
    }, STOP_TIMEOUT_MS);

    managed.process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  host.processes.delete(serverId);
  host.persistHistory(serverId);
  await removeContainer(serverId);
  host.daemonSay(serverId, "Server marked as OFF");
  host.setStatus(serverId, "STOPPED", null);
  // Keep the flag briefly so a late attach-exit handler cannot auto-restart.
  setTimeout(() => host.intentionalStops.delete(serverId), 60_000);
}

/** Immediate force-stop: docker kill + remove, no graceful `stop` command. */
export async function killProcess(host: LifecycleHost, serverId: string): Promise<void> {
  const managed = host.processes.get(serverId);
  const name = managed?.container ?? containerName(serverId);

  host.intentionalStops.add(serverId);
  host.restartAttempts.delete(serverId);
  host.setStatus(serverId, "STOPPING");
  host.daemonSay(serverId, "Server marked as KILLING");
  host.daemonSay(serverId, "Force-killing Docker container...");

  // Drop from map first so the exit handler does not auto-restart
  host.processes.delete(serverId);

  try {
    await docker(["kill", name], { timeout: 15_000 });
  } catch {
    try {
      await docker(["rm", "-f", name], { timeout: 15_000 });
    } catch {
      // already gone
    }
  }

  if (managed) {
    try {
      managed.process.kill("SIGKILL");
    } catch {
      // ignore
    }
  }

  host.persistHistory(serverId);
  await removeContainer(serverId);
  host.daemonSay(serverId, "Server marked as OFF");
  host.setStatus(serverId, "STOPPED", null);
  setTimeout(() => host.intentionalStops.delete(serverId), 60_000);
}

export async function sendProcessCommand(
  host: LifecycleHost,
  serverId: string,
  command: string,
): Promise<void> {
  const cleaned = command.replace(/[\r\n]/g, "").trim();
  if (!cleaned) return;
  if (/[;&|`$<>\\]/.test(cleaned)) {
    throw new Error("Invalid characters in command");
  }

  if (!host.processes.has(serverId)) {
    const ok = await host.adoptRunning(serverId);
    if (!ok) throw new Error("Server is not running");
  }

  const managed = host.processes.get(serverId);
  if (!managed) throw new Error("Server is not running");
  managed.process.stdin.write(`${cleaned}\n`);
}

export async function stopAllProcesses(host: LifecycleHost): Promise<void> {
  const ids = [...host.processes.keys()];
  await Promise.all(ids.map((id) => stopProcess(host, id)));
}
