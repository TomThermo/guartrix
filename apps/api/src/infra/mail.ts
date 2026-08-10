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

function fromHeaderValue(): string {
  const fromRaw = config.mail.from.trim() || "noreply@guartrix.com";
  if (fromRaw.includes("<")) return fromRaw;
  const name = (config.appName || "Guartrix").replace(/"/g, "");
  return `"${name}" <${fromRaw}>`;
}

function buildMimeMessage(msg: MailMessage): string {
  const now = new Date();
  const host = config.mail.smtpHost || "localhost";
  const messageId = `<${now.getTime()}.${Math.random().toString(36).slice(2, 10)}@${host}>`;
  const headers = [
    `From: ${fromHeaderValue()}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];

  const textBody = msg.text.replace(/\r?\n/g, "\r\n");
  if (!msg.html?.trim()) {
    return [...headers, "Content-Type: text/plain; charset=utf-8", "", textBody, ""].join("\r\n");
  }

  const boundary = `guartrix_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const htmlBody = msg.html.replace(/\r?\n/g, "\r\n");
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    textBody,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlBody,
    `--${boundary}--`,
    "",
  ].join("\r\n");
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
  const mime = buildMimeMessage(msg);
  await fs.writeFile(outboxPath, mime, { mode: 0o600 });

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

    const fromRaw = config.mail.from.trim() || "noreply@guartrix.com";
    const fromEnvelope = fromRaw.includes("<")
      ? (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw)
      : fromRaw;
    write(`MAIL FROM:<${fromEnvelope}>`);
    await expect("250");
    write(`RCPT TO:<${msg.to}>`);
    await expect("250");
    write("DATA");
    await expect("354");
    // Dot-stuff lines that begin with "." (RFC 5321)
    const mime = buildMimeMessage(msg);
    const stuffed = mime
      .split(/\r?\n/)
      .map((line) => (line.startsWith(".") ? `.${line}` : line))
      .join("\r\n");
    write(`${stuffed}\r\n.`);
    await expect("250");
    write("QUIT");
  } finally {
    socket.destroy();
  }
}
