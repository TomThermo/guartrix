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
 * When SMTP_HOST is set (prefer port 465 / SMTPS), also tries to send via SMTP.
 */
export async function sendMail(
  msg: MailMessage,
): Promise<{ delivered: boolean; outboxPath: string }> {
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
    console.warn(
      `[guartrix] SMTP send failed (outbox kept at ${outboxPath}):`,
      err instanceof Error ? err.message : err,
    );
    return { delivered: false, outboxPath };
  }
}

async function smtpSend(msg: MailMessage): Promise<void> {
  const host = config.mail.smtpHost;
  const port = config.mail.smtpPort;
  const secure = config.mail.smtpSecure;

  if (!secure && config.mail.smtpStartTls) {
    throw new Error("STARTTLS not supported; use SMTP_SECURE=true (port 465) or leave SMTP unset");
  }

  const socket: net.Socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(s))
      : net.connect({ host, port }, () => resolve(s));
    s.on("error", reject);
  });

  const read = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const onData = (buf: Buffer) => {
        socket.off("error", onErr);
        resolve(buf.toString("utf8"));
      };
      const onErr = (err: Error) => {
        socket.off("data", onData);
        reject(err);
      };
      socket.once("data", onData);
      socket.once("error", onErr);
    });

  const write = (line: string) => {
    socket.write(line.endsWith("\r\n") ? line : `${line}\r\n`);
  };

  const expect = async (code: string) => {
    const resp = await read();
    if (!resp.startsWith(code)) {
      throw new Error(`SMTP unexpected: ${resp.trim().slice(0, 200)}`);
    }
    return resp;
  };

  try {
    await expect("220");
    write("EHLO guartrix");
    await expect("250");

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
    const payload = [
      `From: ${config.mail.from}`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
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
