import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { daemonToPanelAuthorization } from "@msm/shared/daemon-jwt";
import { config, serverDir } from "./config.js";
import { openFirewallPort } from "./firewall.js";
import { acceptSftpSession, type SftpCaps } from "./sftp-handlers.js";

const require = createRequire(import.meta.url);
// ssh2 is CommonJS — named ESM imports fail at runtime
const ssh2 = require("ssh2") as typeof import("ssh2");
const { Server } = ssh2;
type AuthContext = import("ssh2").AuthContext;

export interface SftpAuthResult {
  ok: boolean;
  serverId?: string;
  /** @deprecated Prefer canUpload/canUpdate/canCreate/canDelete */
  writable?: boolean;
  canUpload?: boolean;
  canUpdate?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  error?: string;
}

export interface SftpServerOptions {
  port: number;
  enabled: boolean;
  panelUrl: string;
  daemonToken: string;
  /** Node id for short-lived panel JWTs (optional → legacy bearer). */
  nodeId?: string | null;
  host?: string;
}

export interface SftpServerHandle {
  port: number;
  listening: boolean;
  close: () => Promise<void>;
}

function parseSftpUsername(raw: string): { username: string; serverId: string } | null {
  const idx = raw.lastIndexOf(".");
  if (idx <= 0 || idx >= raw.length - 1) return null;
  const username = raw.slice(0, idx).trim();
  const serverId = raw.slice(idx + 1).trim();
  if (!username || !serverId || serverId.includes("/")) return null;
  return { username, serverId };
}

async function ensureHostKey(keyPath: string): Promise<Buffer[]> {
  const keys: Buffer[] = [];
  const ed25519Path = `${keyPath}_ed25519`;

  const loadOrCreateRsa = async (): Promise<Buffer> => {
    try {
      return await fsp.readFile(keyPath);
    } catch {
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs1", format: "pem" },
        publicKeyEncoding: { type: "pkcs1", format: "pem" },
      });
      await fsp.mkdir(path.dirname(keyPath), { recursive: true });
      await fsp.writeFile(keyPath, privateKey, { mode: 0o600 });
      return Buffer.from(privateKey);
    }
  };

  keys.push(await loadOrCreateRsa());

  // Prefer ed25519 too (better FileZilla / modern OpenSSH compatibility)
  try {
    await fsp.access(ed25519Path);
  } catch {
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("ssh-keygen", ["-t", "ed25519", "-f", ed25519Path, "-N", "", "-q"], {
        encoding: "utf8",
      });
      if (result.status === 0) {
        await fsp.chmod(ed25519Path, 0o600).catch(() => undefined);
      }
    } catch {
      // optional
    }
  }
  try {
    keys.push(await fsp.readFile(ed25519Path));
  } catch {
    // optional
  }

  return keys;
}

async function authenticateWithPanel(
  opts: SftpServerOptions,
  username: string,
  serverId: string,
  password: string,
): Promise<SftpAuthResult> {
  const base = opts.panelUrl.replace(/\/$/, "");
  const url = `${base}/api/internal/sftp-auth`;
  const bearer = opts.nodeId
    ? daemonToPanelAuthorization(opts.nodeId, opts.daemonToken)
    : opts.daemonToken;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, serverId, password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    const body = (await res.json()) as SftpAuthResult;
    if (!body.ok) return { ok: false, error: body.error || "denied" };
    const canUpload = Boolean(body.canUpload ?? body.writable);
    const canUpdate = Boolean(body.canUpdate ?? body.writable);
    const canCreate = Boolean(body.canCreate ?? body.writable);
    const canDelete = Boolean(body.canDelete ?? body.writable);
    return {
      ok: true,
      serverId: body.serverId || serverId,
      writable: canUpload || canUpdate || canCreate || canDelete,
      canUpload,
      canUpdate,
      canCreate,
      canDelete,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Start the embedded SFTP server (ssh2) for this node.
 * Username format: `{panelUsername}.{serverId}`; password = panel password.
 */
export async function startSftpServer(opts: SftpServerOptions): Promise<SftpServerHandle> {
  if (!opts.enabled) {
    return {
      port: opts.port,
      listening: false,
      close: async () => undefined,
    };
  }

  const keyPath = path.join(config.dataDir, "sftp_host_key");
  const hostKeys = await ensureHostKey(keyPath);
  await fsp.mkdir(path.join(config.dataDir, "servers"), { recursive: true });

  try {
    await openFirewallPort(opts.port);
  } catch (err) {
    console.warn(
      "[guartrix] Could not open SFTP firewall port:",
      err instanceof Error ? err.message : err,
    );
  }

  let listening = false;

  const server = new Server(
    {
      hostKeys,
      // No greeting banner — some SFTP clients mishandle pre-KEX text
    },
    (client) => {
      let authAttempts = 0;
      let sessionRoot: string | null = null;
      let sessionServerId: string | null = null;
      let sessionCaps: SftpCaps = {
        canUpload: false,
        canUpdate: false,
        canCreate: false,
        canDelete: false,
      };

      const finishAuth = async (
        ctx: AuthContext,
        usernameRaw: string,
        password: string,
      ): Promise<void> => {
        authAttempts += 1;
        if (authAttempts > 8) {
          ctx.reject();
          return;
        }
        const parsed = parseSftpUsername(usernameRaw);
        if (!parsed) {
          ctx.reject(["password", "keyboard-interactive"]);
          return;
        }
        const result = await authenticateWithPanel(
          opts,
          parsed.username,
          parsed.serverId,
          password,
        );
        if (!result.ok || !result.serverId) {
          console.warn(
            `[guartrix] SFTP auth failed for ${parsed.username}.${parsed.serverId}: ${result.error ?? "denied"}`,
          );
          ctx.reject(["password", "keyboard-interactive"]);
          return;
        }
        const root = serverDir(result.serverId);
        try {
          await fsp.mkdir(root, { recursive: true });
        } catch {
          ctx.reject();
          return;
        }
        sessionRoot = root;
        sessionServerId = result.serverId;
        sessionCaps = {
          canUpload: Boolean(result.canUpload),
          canUpdate: Boolean(result.canUpdate),
          canCreate: Boolean(result.canCreate),
          canDelete: Boolean(result.canDelete),
        };
        ctx.accept();
      };

      client.on("authentication", (ctx: AuthContext) => {
        if (ctx.method === "password") {
          const password =
            typeof (ctx as { password?: string }).password === "string"
              ? (ctx as { password: string }).password
              : "";
          void finishAuth(ctx, ctx.username, password);
          return;
        }

        if (ctx.method === "keyboard-interactive") {
          // FileZilla / WinSCP often use this instead of plain "password"
          const kbd = ctx as import("ssh2").KeyboardAuthContext;
          kbd.prompt(
            [{ prompt: "Password: ", echo: false }],
            "Guartrix SFTP",
            "Enter your panel account password",
            (answers: string[]) => {
              const password =
                Array.isArray(answers) && typeof answers[0] === "string" ? answers[0] : "";
              void finishAuth(ctx, ctx.username, password);
            },
          );
          return;
        }

        // Offer both methods so clients can fall back
        ctx.reject(["password", "keyboard-interactive"]);
      });

      client.on("session", (accept, reject) => {
        if (!sessionRoot || !sessionServerId) {
          reject();
          return;
        }
        const session = accept();
        acceptSftpSession(session, sessionRoot, sessionCaps, sessionServerId);
      });

      client.on("error", () => {
        // ignore client errors
      });
    },
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host ?? "0.0.0.0", () => {
      listening = true;
      server.removeListener("error", reject);
      resolve();
    });
  });

  console.info(`[guartrix] SFTP listening on ${opts.host ?? "0.0.0.0"}:${opts.port}`);

  return {
    port: opts.port,
    get listening() {
      return listening;
    },
    close: () =>
      new Promise<void>((resolve) => {
        listening = false;
        server.close(() => resolve());
      }),
  };
}

export function sftpConfigFromEnv(daemonToken: string): SftpServerOptions {
  const enabled = (process.env.SFTP_ENABLED ?? "true").toLowerCase() !== "false";
  const port = Number(process.env.SFTP_PORT ?? 2022) || 2022;
  const panelUrl =
    process.env.PANEL_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    `http://127.0.0.1:${process.env.API_PORT ?? 3001}`;
  const nodeId = process.env.DAEMON_NODE_ID?.trim() || process.env.NODE_ID?.trim() || null;
  return {
    enabled,
    port,
    panelUrl,
    daemonToken,
    nodeId,
    host: "0.0.0.0",
  };
}
