/**
 * SFTP protocol operation handlers (REALPATH/STAT/OPEN/READ/WRITE/...) bound
 * onto an ssh2 `SFTPStream` for a single authenticated session. Split out of
 * sftp-server.ts, which owns connection/auth/host-key setup instead.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { assertDiskSpace, invalidateServerDataCache } from "./disk-quota.js";
import { isSensitiveFileName } from "./files.js";
import { resolveJailPath, toSftpPath } from "./sftp-jail.js";

const require = createRequire(import.meta.url);
// ssh2 is CommonJS — named ESM imports fail at runtime
const ssh2 = require("ssh2") as typeof import("ssh2");
const { utils } = ssh2;

const { sftp: sftpUtils } = utils;
const OPEN_MODE = sftpUtils.OPEN_MODE;
const STATUS_CODE = sftpUtils.STATUS_CODE;

export type SftpCaps = {
  canUpload: boolean;
  canUpdate: boolean;
  canCreate: boolean;
  canDelete: boolean;
};

type OpenHandle =
  | { kind: "file"; fd: number; path: string; flags: number }
  | { kind: "dir"; path: string; entries: string[]; index: number };

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

export function bindSftpSession(
  // biome-ignore lint/suspicious/noExplicitAny: ssh2 SFTP stream lacks usable TypeScript types
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

  const status = (reqid: number, code: number, message = ""): void => {
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
      const allowed = exists ? caps.canUpdate : creating ? caps.canUpload : caps.canUpdate;
      if (!allowed) {
        status(reqid, STATUS_CODE.PERMISSION_DENIED);
        return;
      }
      if (isSensitiveFileName(path.basename(target))) {
        status(reqid, STATUS_CODE.PERMISSION_DENIED);
        return;
      }
      // Disk quota check before opening for write
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
      if (flags & OPEN_MODE.WRITE || flags & OPEN_MODE.APPEND) {
        nodeFlags = flags & OPEN_MODE.READ ? fs.constants.O_RDWR : fs.constants.O_WRONLY;
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

  sftp.on("READ", (reqid: number, handle: Buffer, offset: number, length: number) => {
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
  });

  sftp.on("WRITE", (reqid: number, handle: Buffer, offset: number, data: Buffer) => {
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
  });

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

export function acceptSftpSession(
  // biome-ignore lint/suspicious/noExplicitAny: ssh2 session lacks usable TypeScript types
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
