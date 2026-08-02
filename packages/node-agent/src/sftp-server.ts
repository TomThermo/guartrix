import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { daemonToPanelAuthorization } from "@msm/shared/daemon-jwt";
import { config, serverDir } from "./config.js";
import { assertDiskSpace, invalidateServerDataCache } from "./disk-quota.js";
import { isSensitiveFileName } from "./files.js";
import { openFirewallPort } from "./firewall.js";

const require = createRequire(import.meta.url);
// ssh2 is CommonJS — named ESM imports fail at runtime
const ssh2 = require("ssh2") as typeof import("ssh2");
const { Server, utils } = ssh2;
type AuthContext = import("ssh2").AuthContext;

const { sftp: sftpUtils } = utils;
const OPEN_MODE = sftpUtils.OPEN_MODE;
const STATUS_CODE = sftpUtils.STATUS_CODE;

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

type SftpCaps = {
  canUpload: boolean;
  canUpdate: boolean;
  canCreate: boolean;
  canDelete: boolean;
};

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

type OpenHandle =
  | { kind: "file"; fd: number; path: string; flags: number }
  | { kind: "dir"; path: string; entries: string[]; index: number };

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
      const result = spawnSync(
        "ssh-keygen",
        ["-t", "ed25519", "-f", ed25519Path, "-N", "", "-q"],
        { encoding: "utf8" },
      );
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
  const bearer =
    opts.nodeId
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

function attrsFromStats(stats: fs.Stats) {
  return {
    mode: stats.mode,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    atime: Math.floor(stats.atimeMs / 1000),
    mtime: Math.floor(stats.mtimeMs / 1000),
  };
}

const EMPTY_ATTRS = {
  mode: 0o644,
  uid: 0,
  gid: 0,
  size: 0,
  atime: 0,
  mtime: 0,
};

function handleKey(handle: Buffer | string): string {
  return Buffer.isBuffer(handle) ? handle.toString("binary") : String(handle);
}

function resolveJailPath(root: string, requestPath: string): string | null {
  const cleaned = requestPath.replace(/\\/g, "/");
  const relative = cleaned.replace(/^\/+/, "");
  const rootResolved = path.resolve(root);
  let rootReal = rootResolved;
  try {
    rootReal = fs.realpathSync(rootResolved);
  } catch {
    // root may not exist yet
  }

  const parts = relative
    ? relative.split("/").filter((p) => p && p !== ".")
    : [];
  if (parts.some((p) => p === "..")) return null;

  let cursor = rootReal;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const st = fs.lstatSync(cursor);
      if (st.isSymbolicLink()) return null;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") break;
      return null;
    }
  }

  const resolved = parts.length
    ? path.resolve(rootReal, parts.join("/"))
    : rootReal;
  if (resolved !== rootReal && !resolved.startsWith(rootReal + path.sep)) {
    return null;
  }
  if (fs.existsSync(resolved)) {
    try {
      const real = fs.realpathSync(resolved);
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return resolved;
}

function toSftpPath(root: string, absolute: string): string {
  const rel = path.relative(root, absolute).split(path.sep).join("/");
  return rel ? `/${rel}` : "/";
}

function bindSftpSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sftp: any,
  root: string,
  caps: SftpCaps,
  serverId: string,
): void {
  const handles = new Map<string, OpenHandle>();
  let handleSeq = 0;

  const nextHandle = (): Buffer => {
    handleSeq += 1;
    return Buffer.from(`h${handleSeq}`);
  };

  const status = (
    reqid: number,
    code: number,
    message = "",
  ): void => {
    sftp.status(reqid, code, message);
  };

  sftp.on("REALPATH", (reqid: number, requestPath: string) => {
    const target = resolveJailPath(root, requestPath || ".");
    if (!target) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    void fsp
      .stat(target)
      .then((stats) => {
        sftp.name(reqid, [
          {
            filename: toSftpPath(root, target),
            longname: toSftpPath(root, target),
            attrs: attrsFromStats(stats),
          },
        ]);
      })
      .catch(() => {
        sftp.name(reqid, [
          {
            filename: toSftpPath(root, target),
            longname: toSftpPath(root, target),
            attrs: EMPTY_ATTRS,
          },
        ]);
      });
  });

  sftp.on("STAT", onStat);
  sftp.on("LSTAT", onStat);
  sftp.on("FSTAT", (reqid: number, handle: Buffer) => {
    const h = handles.get(handleKey(handle));
    if (!h) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid handle");
      return;
    }
    void fsp
      .stat(h.path)
      .then((stats) => sftp.attrs(reqid, attrsFromStats(stats)))
      .catch(() => status(reqid, STATUS_CODE.NO_SUCH_FILE));
  });

  function onStat(reqid: number, requestPath: string): void {
    const target = resolveJailPath(root, requestPath);
    if (!target) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    void fsp
      .stat(target)
      .then((stats) => sftp.attrs(reqid, attrsFromStats(stats)))
      .catch(() => status(reqid, STATUS_CODE.NO_SUCH_FILE));
  }

  sftp.on("OPENDIR", (reqid: number, requestPath: string) => {
    const target = resolveJailPath(root, requestPath || "/");
    if (!target) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    void fsp
      .readdir(target)
      .then((entries) => {
        const filtered = entries.filter((name) => !isSensitiveFileName(name));
        const handle = nextHandle();
        handles.set(handleKey(handle), {
          kind: "dir",
          path: target,
          entries: [".", "..", ...filtered],
          index: 0,
        });
        sftp.handle(reqid, handle);
      })
      .catch(() => status(reqid, STATUS_CODE.NO_SUCH_FILE));
  });

  sftp.on("READDIR", (reqid: number, handle: Buffer) => {
    const h = handles.get(handleKey(handle));
    if (!h || h.kind !== "dir") {
      status(reqid, STATUS_CODE.FAILURE, "Invalid handle");
      return;
    }
    if (h.index >= h.entries.length) {
      status(reqid, STATUS_CODE.EOF);
      return;
    }
    const batch = h.entries.slice(h.index, h.index + 64);
    h.index += batch.length;
    void Promise.all(
      batch.map(async (name) => {
        // Never follow ".." outside the jail root for attrs.
        if (name === "..") {
          return { filename: name, longname: name, attrs: EMPTY_ATTRS };
        }
        const full = name === "." ? h.path : path.join(h.path, name);
        if (isSensitiveFileName(name)) {
          return null;
        }
        let attrs = EMPTY_ATTRS;
        try {
          attrs = attrsFromStats(await fsp.lstat(full));
        } catch {
          // ignore
        }
        return { filename: name, longname: name, attrs };
      }),
    ).then((names) =>
      sftp.name(
        reqid,
        names.filter((n): n is NonNullable<typeof n> => n != null),
      ),
    );
  });

  sftp.on("OPEN", (reqid: number, requestPath: string, flags: number) => {
    const resolved = resolveJailPath(root, requestPath);
    if (!resolved) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    const target: string = resolved;
    if (isSensitiveFileName(target)) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED, "Protected file");
      return;
    }
    const wantsWrite =
      Boolean(flags & OPEN_MODE.WRITE) ||
      Boolean(flags & OPEN_MODE.APPEND) ||
      Boolean(flags & OPEN_MODE.CREAT) ||
      Boolean(flags & OPEN_MODE.TRUNC);
    if (wantsWrite) {
      const creating = Boolean(flags & OPEN_MODE.CREAT);
      let exists = false;
      try {
        fs.lstatSync(target);
        exists = true;
      } catch {
        exists = false;
      }
      // New file → upload; existing edit/truncate → update.
      const allowed = exists
        ? caps.canUpdate
        : creating
          ? caps.canUpload
          : caps.canUpdate;
      if (!allowed) {
        status(reqid, STATUS_CODE.PERMISSION_DENIED);
        return;
      }
      if (isSensitiveFileName(path.basename(target))) {
        status(reqid, STATUS_CODE.PERMISSION_DENIED);
        return;
      }
      // Disk quota check before opening for write (Wings HasSpaceAvailable)
      void assertDiskSpace(serverId, exists && !(flags & OPEN_MODE.TRUNC) ? 0 : 1)
        .then(() => {
          openFile();
        })
        .catch((err) => {
          status(
            reqid,
            STATUS_CODE.FAILURE,
            err instanceof Error ? err.message : "Disk quota exceeded",
          );
        });
      return;
    }

    openFile();

    function openFile() {
    let nodeFlags = fs.constants.O_RDONLY;
    if ((flags & OPEN_MODE.WRITE) || (flags & OPEN_MODE.APPEND)) {
      nodeFlags =
        flags & OPEN_MODE.READ
          ? fs.constants.O_RDWR
          : fs.constants.O_WRONLY;
    }
    if (flags & OPEN_MODE.APPEND) nodeFlags |= fs.constants.O_APPEND;
    if (flags & OPEN_MODE.CREAT) nodeFlags |= fs.constants.O_CREAT;
    if (flags & OPEN_MODE.TRUNC) nodeFlags |= fs.constants.O_TRUNC;
    if (fs.constants.O_NOFOLLOW) nodeFlags |= fs.constants.O_NOFOLLOW;

    fs.open(target, nodeFlags, 0o600, (err, fd) => {
      if (err || fd === undefined) {
        status(reqid, STATUS_CODE.FAILURE, "Open failed");
        return;
      }
      const handle = nextHandle();
      handles.set(handleKey(handle), {
        kind: "file",
        fd,
        path: target,
        flags,
      });
      sftp.handle(reqid, handle);
    });
    }
  });

  sftp.on(
    "READ",
    (reqid: number, handle: Buffer, offset: number, length: number) => {
      const h = handles.get(handleKey(handle));
      if (!h || h.kind !== "file") {
        status(reqid, STATUS_CODE.FAILURE, "Invalid handle");
        return;
      }
      const maxChunk = 256 * 1024;
      const n = Math.max(0, Math.min(length, maxChunk));
      if (n === 0) {
        status(reqid, STATUS_CODE.EOF);
        return;
      }
      const buf = Buffer.alloc(n);
      fs.read(h.fd, buf, 0, n, offset, (err, bytesRead, buffer) => {
        if (err) {
          status(reqid, STATUS_CODE.FAILURE, err.message);
          return;
        }
        if (bytesRead === 0) {
          status(reqid, STATUS_CODE.EOF);
          return;
        }
        sftp.data(reqid, buffer.subarray(0, bytesRead));
      });
    },
  );

  sftp.on(
    "WRITE",
    (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
      const h = handles.get(handleKey(handle));
      if (!h || h.kind !== "file") {
        status(reqid, STATUS_CODE.FAILURE, "Invalid handle");
        return;
      }
      if (!caps.canUpdate && !caps.canUpload) {
        status(reqid, STATUS_CODE.PERMISSION_DENIED);
        return;
      }
      fs.write(h.fd, data, 0, data.length, offset, (err) => {
        if (err) status(reqid, STATUS_CODE.FAILURE, err.message);
        else {
          invalidateServerDataCache(serverId);
          status(reqid, STATUS_CODE.OK);
        }
      });
    },
  );

  sftp.on("CLOSE", (reqid: number, handle: Buffer) => {
    const h = handles.get(handleKey(handle));
    if (!h) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid handle");
      return;
    }
    handles.delete(handleKey(handle));
    if (h.kind === "file") {
      fs.close(h.fd, () => status(reqid, STATUS_CODE.OK));
      return;
    }
    status(reqid, STATUS_CODE.OK);
  });

  sftp.on("REMOVE", (reqid: number, requestPath: string) => {
    if (!caps.canDelete) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED);
      return;
    }
    const target = resolveJailPath(root, requestPath);
    if (!target || target === path.resolve(root)) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    if (isSensitiveFileName(target)) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED, "Protected file");
      return;
    }
    void fsp
      .unlink(target)
      .then(() => status(reqid, STATUS_CODE.OK))
      .catch(() => status(reqid, STATUS_CODE.FAILURE));
  });

  sftp.on("RMDIR", (reqid: number, requestPath: string) => {
    if (!caps.canDelete) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED);
      return;
    }
    const target = resolveJailPath(root, requestPath);
    if (!target || target === path.resolve(root)) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    void fsp
      .rmdir(target)
      .then(() => status(reqid, STATUS_CODE.OK))
      .catch(() => status(reqid, STATUS_CODE.FAILURE));
  });

  sftp.on("MKDIR", (reqid: number, requestPath: string) => {
    if (!caps.canCreate && !caps.canUpload) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED);
      return;
    }
    const target = resolveJailPath(root, requestPath);
    if (!target) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    void fsp
      .mkdir(target, { mode: 0o700 })
      .then(() => status(reqid, STATUS_CODE.OK))
      .catch(() => status(reqid, STATUS_CODE.FAILURE));
  });

  sftp.on("RENAME", (reqid: number, oldPath: string, newPath: string) => {
    if (!caps.canUpdate) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED);
      return;
    }
    const from = resolveJailPath(root, oldPath);
    const to = resolveJailPath(root, newPath);
    if (!from || !to) {
      status(reqid, STATUS_CODE.FAILURE, "Invalid path");
      return;
    }
    if (isSensitiveFileName(from) || isSensitiveFileName(to)) {
      status(reqid, STATUS_CODE.PERMISSION_DENIED, "Protected file");
      return;
    }
    void fsp
      .rename(from, to)
      .then(() => status(reqid, STATUS_CODE.OK))
      .catch(() => status(reqid, STATUS_CODE.FAILURE));
  });

  sftp.on("SETSTAT", (reqid: number) => {
    status(reqid, STATUS_CODE.OK);
  });
  sftp.on("FSETSTAT", (reqid: number) => {
    status(reqid, STATUS_CODE.OK);
  });
}

function acceptSftpSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  root: string,
  caps: SftpCaps,
  serverId: string,
): void {
  session.on("sftp", (accept: () => unknown) => {
    const sftp = accept();
    bindSftpSession(sftp, root, caps, serverId);
  });
  session.on("exec", (_accept: unknown, reject: () => void) => {
    reject();
  });
  session.on("shell", (_accept: unknown, reject: () => void) => {
    reject();
  });
}

/**
 * Start the embedded SFTP server (ssh2) for this node.
 * Username format: `{panelUsername}.{serverId}`; password = panel password.
 */
export async function startSftpServer(
  opts: SftpServerOptions,
): Promise<SftpServerHandle> {
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
                Array.isArray(answers) && typeof answers[0] === "string"
                  ? answers[0]
                  : "";
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

  console.info(
    `[guartrix] SFTP listening on ${opts.host ?? "0.0.0.0"}:${opts.port}`,
  );

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
  const enabled =
    (process.env.SFTP_ENABLED ?? "true").toLowerCase() !== "false";
  const port = Number(process.env.SFTP_PORT ?? 2022) || 2022;
  const panelUrl =
    process.env.PANEL_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    `http://127.0.0.1:${process.env.API_PORT ?? 3001}`;
  const nodeId =
    process.env.DAEMON_NODE_ID?.trim() ||
    process.env.NODE_ID?.trim() ||
    null;
  return {
    enabled,
    port,
    panelUrl,
    daemonToken,
    nodeId,
    host: "0.0.0.0",
  };
}
