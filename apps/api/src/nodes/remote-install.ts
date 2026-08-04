import { Client } from "ssh2";
import { config } from "../config.js";

export type RemoteInstallInput = {
  sshHost: string;
  sshPort?: number;
  sshUser: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  /** Command body WITHOUT leading sudo — installer expects root. */
  installScript: string;
  /** Optional live chunks (SSH stdout/stderr + status lines). */
  onChunk?: (chunk: RemoteInstallChunk) => void;
};

export type RemoteInstallChunk =
  | { type: "status"; message: string }
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string };

export type RemoteInstallResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

const MAX_LOG = 80_000;

function trimLog(s: string): string {
  if (s.length <= MAX_LOG) return s;
  return `…(truncated)…\n${s.slice(-MAX_LOG)}`;
}

/**
 * SSH into a VPS and run the daemon install script as root.
 * Credentials are never persisted — only used for this connection.
 */
export function runRemoteDaemonInstall(
  input: RemoteInstallInput,
): Promise<RemoteInstallResult> {
  const port = input.sshPort && input.sshPort > 0 ? input.sshPort : 22;
  const host = input.sshHost.trim();
  const username = input.sshUser.trim();
  const emit = input.onChunk;
  if (!host || !username) {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: "SSH host and username are required",
    });
  }
  if (!input.sshPassword && !input.sshPrivateKey?.trim()) {
    return Promise.resolve({
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: "Provide an SSH password or private key",
    });
  }

  const isRoot = username === "root";
  let remoteCmd: string;
  if (isRoot) {
    remoteCmd = input.installScript;
  } else if (input.sshPassword) {
    // Non-root: elevate with sudo -S (password on stdin once).
    remoteCmd = `echo ${JSON.stringify(input.sshPassword)} | sudo -S -p '' -E bash -c ${JSON.stringify(input.installScript)}`;
  } else {
    remoteCmd = `sudo -n -E bash -c ${JSON.stringify(input.installScript)}`;
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: RemoteInstallResult) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {
        // ignore
      }
      resolve({
        ...result,
        stdout: trimLog(result.stdout),
        stderr: trimLog(result.stderr),
      });
    };

    const timer = setTimeout(() => {
      emit?.({ type: "status", message: "Timed out after 15 minutes" });
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: "SSH install timed out (15 minutes)",
      });
    }, 15 * 60_000);

    emit?.({
      type: "status",
      message: `Connecting to ${username}@${host}:${port}…`,
    });

    conn.on("ready", () => {
      emit?.({
        type: "status",
        message: "SSH connected — running install script on the VPS…",
      });
      conn.exec(remoteCmd, { pty: true }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          finish({
            ok: false,
            exitCode: null,
            stdout,
            stderr,
            error: err.message,
          });
          return;
        }
        stream.on("data", (d: Buffer) => {
          const text = d.toString("utf8");
          stdout += text;
          emit?.({ type: "stdout", data: text });
        });
        stream.stderr.on("data", (d: Buffer) => {
          const text = d.toString("utf8");
          stderr += text;
          emit?.({ type: "stderr", data: text });
        });
        stream.on("close", (code: number | null) => {
          clearTimeout(timer);
          const exitCode = typeof code === "number" ? code : null;
          emit?.({
            type: "status",
            message:
              exitCode === 0
                ? "Remote script finished successfully"
                : `Remote script exited with code ${exitCode ?? "?"}`,
          });
          finish({
            ok: exitCode === 0,
            exitCode,
            stdout,
            stderr,
            error:
              exitCode === 0
                ? undefined
                : `Remote install exited with code ${exitCode ?? "?"}`,
          });
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      emit?.({ type: "status", message: `SSH error: ${err.message}` });
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: err.message,
      });
    });

    const connectOpts: Parameters<Client["connect"]>[0] = {
      host,
      port,
      username,
      readyTimeout: 45_000,
      tryKeyboard: Boolean(input.sshPassword),
      hostVerifier: () => true,
    };
    if (input.sshPrivateKey?.trim()) {
      connectOpts.privateKey = input.sshPrivateKey;
      if (input.sshPassword) connectOpts.passphrase = input.sshPassword;
    } else if (input.sshPassword) {
      connectOpts.password = input.sshPassword;
    }

    // Some Ubuntu images use keyboard-interactive instead of password.
    conn.on("keyboard-interactive", (_name, _instructions, _lang, prompts, finishKb) => {
      finishKb(prompts.map(() => input.sshPassword || ""));
    });

    conn.connect(connectOpts);
  });
}

export function defaultRepoUrl(): string {
  return (
    process.env.GUARTRIX_REPO_URL?.trim() ||
    "https://github.com/TomThermo/guartrix.git"
  );
}

export function panelPublicBase(): string {
  return (
    process.env.PUBLIC_BASE_URL?.trim() || `https://${config.publicHost}`
  ).replace(/\/$/, "");
}

/** Download-then-run install command for the remote VPS (root / sudo). */
export function buildDaemonInstallScript(opts: {
  token: string;
  nodeId: string;
  fqdn: string;
  daemonPort: number;
  panelUrl: string;
  sftpPort: number;
  repoUrl: string;
}): string {
  const scriptUrl = `${opts.panelUrl}/install-daemon.sh`;
  const args = [
    `--token ${shellQuote(opts.token)}`,
    `--node-id ${shellQuote(opts.nodeId)}`,
    `--fqdn ${shellQuote(opts.fqdn)}`,
    `--port ${opts.daemonPort}`,
    `--panel ${shellQuote(opts.panelUrl)}`,
    `--repo ${shellQuote(opts.repoUrl)}`,
    `--sftp-port ${opts.sftpPort}`,
  ].join(" ");
  return [
    `curl -Lo /tmp/guartrix-daemon.sh ${shellQuote(scriptUrl)}`,
    `bash /tmp/guartrix-daemon.sh ${args}`,
  ].join(" && ");
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
