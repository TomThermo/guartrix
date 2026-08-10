/**
 * Attach / adopt paths for a managed Minecraft container. Extracted from
 * process-manager.ts so that file can stay focused on start/stop orchestration
 * and status maps.
 *
 * Functions operate on an `AttachHost` — the slice of ProcessManager state and
 * helpers they need — rather than a concrete class.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServerStatus } from "@guartrix/shared";
import { consoleLineIndicatesBootFailure, consoleLineIndicatesReady } from "@guartrix/shared";
import {
  containerName,
  isContainerRunning,
  listGuartrixContainers,
  resolveContainerName,
} from "./docker.js";
import {
  appendConsoleHistory,
  isPlayersListLine,
  loadPersistedConsoleHistory,
  type ConsoleHost,
} from "./process-console.js";
import type { ManagedProcess } from "./process-types.js";

const execFileAsync = promisify(execFile);

/**
 * Kill leftover `docker run` / `docker attach` client processes for a
 * container without stopping the container itself. After a daemon restart the
 * previous client's process can stay alive (reparented to init) and keep
 * holding stdin — which blocks the new daemon from sending console commands.
 *
 * Uses SIGKILL so Docker's default sig-proxy cannot forward SIGTERM into the
 * Minecraft process.
 */
export async function killOrphanDockerClients(container: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,args="], {
      timeout: 5_000,
    });
    const pids: number[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const space = trimmed.indexOf(" ");
      if (space <= 0) continue;
      const pid = Number(trimmed.slice(0, space));
      const args = trimmed.slice(space + 1);
      if (!Number.isFinite(pid) || pid === process.pid) continue;
      if (
        !args.includes(`--name ${container}`) &&
        !args.includes(`--name=${container}`) &&
        !args.endsWith(` ${container}`) &&
        !args.includes(` ${container} `)
      ) {
        // Also match bare attach/run with container as last arg
        if (!args.includes(container)) continue;
      }
      if (!/\bdocker\b/.test(args)) continue;
      if (!/\b(run|attach)\b/.test(args)) continue;
      pids.push(pid);
    }
    for (const pid of pids) {
      try {
        await execFileAsync("sudo", ["-n", "kill", "-9", String(pid)], {
          timeout: 5_000,
        });
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
    if (pids.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  } catch {
    // best-effort
  }
}

export interface AttachHost extends ConsoleHost {
  readonly intentionalStops: Set<string>;
  readonly restartAttempts: Map<string, { count: number; at: number }>;
  daemonSay(serverId: string, message: string): void;
  setStatus(serverId: string, status: ServerStatus, errorMessage?: string | null): void;
  persistHistory(serverId: string): void;
  pushConsoleLine(serverId: string, line: string, stream?: "stdout" | "stderr"): void;
  getStatus(serverId: string): ServerStatus;
  maybeAutoRestart(serverId: string, reason: string): Promise<void>;
}

export function wireManagedChild(
  host: AttachHost,
  serverId: string,
  name: string,
  child: ChildProcessWithoutNullStreams,
  opts?: { waitForDone?: boolean },
): ManagedProcess {
  if (!host.histories.has(serverId)) {
    host.histories.set(serverId, loadPersistedConsoleHistory(serverId));
  }

  const managed: ManagedProcess = {
    process: child,
    container: name,
    onlinePlayers: new Set(),
  };
  host.processes.set(serverId, managed);

  const waitForDone = opts?.waitForDone === true;
  let sawDone = !waitForDone;
  const serverType = host.lastConfigs.get(serverId)?.type;

  const handleChunk = (stream: "stdout" | "stderr") => (data: Buffer) => {
    const text = data.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line === "") continue;
      appendConsoleHistory(host, serverId, line);
      if (!sawDone && consoleLineIndicatesReady(line, serverType)) {
        sawDone = true;
        host.daemonSay(serverId, "Server marked as RUNNING");
        host.setStatus(serverId, "RUNNING");
      }
      if (consoleLineIndicatesBootFailure(line, serverType)) {
        const msg = line.trim();
        host.daemonSay(serverId, `ERROR: ${msg}`);
        host.setStatus(serverId, "ERROR", msg);
      }
      if (isPlayersListLine(line)) continue;
      host.emit("output", serverId, line, stream);
    }
  };

  child.stdout.on("data", handleChunk("stdout"));
  child.stderr.on("data", handleChunk("stderr"));

  child.on("exit", () => {
    const current = host.processes.get(serverId);
    if (!current || current.process !== child) return;
    host.processes.delete(serverId);
    host.persistHistory(serverId);

    // Attach can drop while the container keeps running (daemon restart,
    // orphan takeover, etc.). Don't mark the server STOPPED in that case.
    void isContainerRunning(serverId)
      .then((still) => {
        if (still) {
          host.daemonSay(serverId, "Console attachment lost — container still running.");
          host.setStatus(serverId, "RUNNING");
          return;
        }
        const code = child.exitCode;
        const signal = child.signalCode;
        // 137 = 128+SIGKILL — typical Docker OOM kill; do not treat as clean stop.
        const oom = code === 137 || code === 137 - 256;
        // SIGTERM/SIGINT via docker stop often surface as exit 143/130 with no signalCode.
        const intentional =
          host.intentionalStops.has(serverId) || host.getStatus(serverId) === "STOPPING";
        const clean =
          intentional ||
          (!oom &&
            (code === 0 ||
              code === 130 ||
              code === 143 ||
              signal === "SIGTERM" ||
              signal === "SIGINT"));
        if (intentional) {
          host.intentionalStops.delete(serverId);
          host.restartAttempts.delete(serverId);
        }
        if (clean) {
          // Intentional stop()/kill() already announces OFF after wait.
          // Do not key off status===STOPPING — stopProcess may already have
          // set STOPPED by the time this async container check finishes.
          if (!intentional) {
            host.daemonSay(serverId, "Server marked as OFF");
          }
          host.setStatus(serverId, "STOPPED", null);
          return;
        }
        const message = oom
          ? `Out of memory (exit 137): heap + JVM overhead exceeded the container limit, or the host ran out of RAM. Remove -XX:+AlwaysPreTouch, lower -Xmx, or free host memory.`
          : `Container exited with code ${code ?? "null"} signal ${signal ?? "null"}`;
        host.daemonSay(serverId, `ERROR: ${message}`);
        host.pushConsoleLine(serverId, `[error] ${message}`, "stderr");
        if (!intentional) {
          host.daemonSay(serverId, "Server marked as OFF");
        }
        host.setStatus(serverId, "ERROR", message);
        void host.maybeAutoRestart(serverId, message);
      })
      .catch(() => {
        if (!host.intentionalStops.has(serverId) && host.getStatus(serverId) !== "STOPPING") {
          host.daemonSay(serverId, "Server marked as OFF");
        }
        host.setStatus(serverId, "STOPPED", null);
      });
  });

  return managed;
}

/**
 * Attach to an already-running container's stdin/stdout so console commands
 * and live logs work again after a daemon restart.
 */
export async function attachToContainer(
  host: AttachHost,
  serverId: string,
  name: string,
  opts?: { waitForDone?: boolean },
): Promise<void> {
  await killOrphanDockerClients(name);

  const child = spawn("sudo", ["-n", "docker", "attach", "--sig-proxy=false", name], {
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", (err) => {
      host.processes.delete(serverId);
      reject(err);
    });
  });

  wireManagedChild(host, serverId, name, child, opts);
  if (!opts?.waitForDone) {
    host.setStatus(serverId, "RUNNING");
  }
}

/**
 * If the Minecraft container is already running (e.g. after a panel/daemon
 * restart) but we have no stdin handle, reattach so commands work again.
 */
export async function adoptRunning(host: AttachHost, serverId: string): Promise<boolean> {
  if (host.processes.has(serverId)) return true;
  const running = await isContainerRunning(serverId).catch(() => false);
  if (!running) return false;
  const name = (await resolveContainerName(serverId).catch(() => null)) ?? containerName(serverId);
  host.daemonSay(serverId, "Reattaching to running container after daemon restart…");
  await attachToContainer(host, serverId, name);
  host.daemonSay(serverId, "Console reattached.");
  return true;
}

/** On daemon boot: reclaim every live Guartrix Minecraft container. */
export async function reattachOrphans(host: AttachHost): Promise<number> {
  let adopted = 0;
  const containers = await listGuartrixContainers().catch(() => []);
  for (const c of containers) {
    if (!c.serverId || c.isMysql) continue;
    if (c.state.toLowerCase() !== "running") continue;
    if (host.processes.has(c.serverId)) continue;
    try {
      await adoptRunning(host, c.serverId);
      adopted += 1;
    } catch (err) {
      console.error(
        `[daemon] failed to reattach ${c.name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return adopted;
}
