import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import { config } from "./config.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** True when operators configured real SMTP (not outbox-only). */
export function isSmtpConfigured(): boolean {
  return Boolean(config.mail.smtpHost);
}

/**
 * Deliver panel mail. Always writes a copy under data/mail-outbox/.
 * When SMTP_HOST is set, also tries to send via SMTP (465 SMTPS or 587 STARTTLS).
 */
export async function sendMail(
  msg: MailMessage,
): Promise<{ delivered: boolean; outboxPath: string; error?: string }> {
  const outboxDir = path.join(config.dataDir, "mail-outbox");
  await fs.mkdir(outboxDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTo = msg.to.replace(/[^a-zA-Z0-9._@+-]/g, "_").slice(0, 64);
  const outboxPath = path.join(outboxDir, `${stamp}_${safeTo}.eml`);
  const body = [
    `To: ${msg.to}`,
    `From: ${config.mail.from}`,
    `Subject: ${msg.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    msg.text,
    "",
  ].join("\r\n");
  await fs.writeFile(outboxPath, body, { mode: 0o600 });

  if (!config.mail.smtpHost) {
    console.info(`[guartrix] Mail outbox (no SMTP): ${outboxPath}`);
    return { delivered: false, outboxPath };
  }

  try {
    await smtpSend(msg);
    return { delivered: true, outboxPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(`[guartrix] SMTP send failed (outbox kept at ${outboxPath}):`, error);
    return { delivered: false, outboxPath, error };
  }
}

function upgradeToTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect(
      { socket, host, servername: host, rejectUnauthorized: true },
      () => resolve(secure),
    );
    secure.on("error", reject);
  });
}

async function smtpSend(msg: MailMessage): Promise<void> {
  const host = config.mail.smtpHost;
  const port = config.mail.smtpPort;
  const secure = config.mail.smtpSecure;
  const startTls = !secure && Boolean(config.mail.smtpStartTls);

  let socket: net.Socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(s))
      : net.connect({ host, port }, () => resolve(s));
    s.on("error", reject);
  });

  let buffer = "";

  const takeCompleteResponse = (): string | null => {
    const lines = buffer.split(/\r?\n/);
    let end = -1;
    for (let i = 0; i < lines.length - 1; i++) {
      // Final SMTP line is "NNN " (space), continued lines are "NNN-"
      if (/^\d{3} /.test(lines[i]!)) {
        end = i;
        break;
      }
    }
    if (end < 0) return null;
    const chunk = lines.slice(0, end + 1).join("\n");
    buffer = lines.slice(end + 1).join("\n");
    return chunk;
  };

  const readResponse = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const early = takeCompleteResponse();
      if (early !== null) {
        resolve(early);
        return;
      }
      const onData = (buf: Buffer) => {
        buffer += buf.toString("utf8");
        const done = takeCompleteResponse();
        if (done !== null) {
          socket.off("data", onData);
          socket.off("error", onErr);
          resolve(done);
        }
      };
      const onErr = (err: Error) => {
        socket.off("data", onData);
        reject(err);
      };
      socket.on("data", onData);
      socket.once("error", onErr);
    });

  const write = (line: string) => {
    socket.write(line.endsWith("\r\n") ? line : `${line}\r\n`);
  };

  const expect = async (code: string) => {
    const resp = await readResponse();
    if (!resp.startsWith(code)) {
      throw new Error(`SMTP unexpected: ${resp.trim().slice(0, 200)}`);
    }
    return resp;
  };

  try {
    await expect("220");
    write(`EHLO guartrix`);
    await expect("250");

    if (startTls) {
      write("STARTTLS");
      await expect("220");
      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      socket = await upgradeToTls(socket, host);
      buffer = "";
      write("EHLO guartrix");
      await expect("250");
    }

    const user = config.mail.smtpUser;
    const pass = config.mail.smtpPass;
    if (user && pass) {
      write("AUTH LOGIN");
      await expect("334");
      write(Buffer.from(user).toString("base64"));
      await expect("334");
      write(Buffer.from(pass).toString("base64"));
      await expect("235");
    }

    write(`MAIL FROM:<${config.mail.from}>`);
    await expect("250");
    write(`RCPT TO:<${msg.to}>`);
    await expect("250");
    write("DATA");
    await expect("354");
    const now = new Date();
    const messageId = `<${now.getTime()}.${Math.random().toString(36).slice(2, 10)}@${host || "guartrix.com"}>`;
    const fromRaw = config.mail.from.trim();
    const fromHeader = fromRaw.includes("<")
      ? fromRaw
      : `"Guartrix" <${fromRaw}>`;
    const payload = [
      `From: ${fromHeader}`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
      `Date: ${now.toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      msg.text.replace(/\r?\n/g, "\r\n"),
      ".",
    ].join("\r\n");
    write(payload);
    await expect("250");
    write("QUIT");
  } finally {
    socket.destroy();
  }
}
