import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../../");

dotenv.config({ path: path.join(rootDir, ".env") });

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 3001),
  adminPassword: process.env.ADMIN_PASSWORD ?? "changeme",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
  dataDir: path.resolve(rootDir, process.env.DATA_DIR ?? "./data"),
  javaPath: process.env.JAVA_PATH ?? "java",
  dockerImage: process.env.DOCKER_IMAGE ?? "eclipse-temurin:25-jre-jammy",
  /** Public hostname/IP players use to connect (and for resource-pack URLs). */
  publicHost: process.env.PUBLIC_HOST ?? process.env.HOST ?? "127.0.0.1",
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    `http://${process.env.PUBLIC_HOST ?? "127.0.0.1"}:${process.env.API_PORT ?? 3001}`,
  /** Set SESSION_SECURE=true behind HTTPS */
  sessionSecure:
    process.env.SESSION_SECURE === "true" ||
    process.env.SESSION_SECURE === "1" ||
    (process.env.PUBLIC_BASE_URL ?? "").startsWith("https://"),
  /** Optional Redis for multi-API HA (sessions, rate limits, transfers, locks, pub/sub). */
  redisUrl: process.env.REDIS_URL?.trim() || "",
  sessionStore: (process.env.SESSION_STORE || "file").trim().toLowerCase(),
  rateLimitStore: (process.env.RATE_LIMIT_STORE || "file").trim().toLowerCase(),
  schedulerLockTtlMs: (() => {
    const n = Number(process.env.SCHEDULER_LOCK_TTL_MS ?? 15_000);
    return Number.isFinite(n) && n >= 3000 ? Math.floor(n) : 15_000;
  })(),
  /** Cloudflare DNS for automatic Minecraft subdomains (optional). */
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || "",
    zoneId: process.env.CLOUDFLARE_ZONE_ID?.trim() || "",
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "",
    /** Apex domain, e.g. guartrix.online */
    domain: (process.env.CLOUDFLARE_DOMAIN?.trim() || "").replace(/^\.+|\.+$/g, ""),
  },
  /** Cloudflare Turnstile (login / register bot check). */
  turnstile: {
    enabled: process.env.TURNSTILE_ENABLED === "1" || process.env.TURNSTILE_ENABLED === "true",
    siteKey: process.env.TURNSTILE_SITE_KEY?.trim() || "",
    secretKey: process.env.TURNSTILE_SECRET_KEY?.trim() || "",
  },
  /** Public self-serve registration (default on for soft launch). */
  registrationEnabled:
    process.env.REGISTRATION_ENABLED !== "false" && process.env.REGISTRATION_ENABLED !== "0",
  /** New self-serve accounts start at 0 — servers come via paid plans later. */
  defaultMaxServers: Number(process.env.DEFAULT_MAX_SERVERS ?? 0),
  defaultMaxMemoryMb: Number(process.env.DEFAULT_MAX_MEMORY_MB ?? 0),
  defaultMaxDatabases: Number(process.env.DEFAULT_MAX_DATABASES ?? 0),
  /** Default backup retention for new servers (1–50). */
  defaultBackupKeepCount: (() => {
    const n = Number(process.env.DEFAULT_BACKUP_KEEP_COUNT ?? 7);
    if (!Number.isFinite(n)) return 7;
    return Math.min(50, Math.max(1, Math.floor(n)));
  })(),
  mail: {
    from: process.env.MAIL_FROM?.trim() || "noreply@guartrix.com",
    smtpHost: process.env.SMTP_HOST?.trim() || "",
    smtpPort: Number(process.env.SMTP_PORT ?? 465),
    smtpSecure:
      process.env.SMTP_SECURE === "true" ||
      process.env.SMTP_SECURE === "1" ||
      (!process.env.SMTP_SECURE && Number(process.env.SMTP_PORT ?? 465) === 465),
    smtpStartTls: process.env.SMTP_STARTTLS === "true" || process.env.SMTP_STARTTLS === "1",
    smtpUser: process.env.SMTP_USER?.trim() || "",
    smtpPass: process.env.SMTP_PASS ?? "",
  },
  /** Roles that must have TOTP 2FA enabled, e.g. "ADMIN" or "ADMIN,OPERATOR". */
  twoFactorRequiredRoles: (process.env.TWO_FACTOR_REQUIRED_ROLES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  /** Outbound alerts for critical activity (crash, offline, security events). */
  alerts: {
    /** Discord-compatible webhook; any URL receives a generic JSON payload. */
    webhookUrl: process.env.ACTIVITY_WEBHOOK_URL?.trim() || "",
    alertEmail: process.env.ALERT_EMAIL?.trim() || "",
    /** Comma-separated action keys to never alert on, e.g. `auth.login-failed`. */
    mutedActions: (process.env.ACTIVITY_ALERT_MUTE ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  /** Optional shell hook after backup (placeholders: {path} {serverId} {backupId} {fileName}). */
  backupOffsiteCmd: process.env.BACKUP_OFFSITE_CMD?.trim() || "",
  /** Panel product name shown in the UI (Admin → Settings). */
  appName: (process.env.APP_NAME?.trim() || "Guartrix").slice(0, 64),
  /** Path or URL for navbar logo (empty = icon mark). */
  appLogo: process.env.APP_LOGO?.trim() || "",
  /** Path or URL for favicon (empty = /favicon.ico). */
  appFavicon: process.env.APP_FAVICON?.trim() || "/favicon.ico",
  /** Extra verbose errors for operators (not a full Laravel-style debug dump). */
  debugMode:
    process.env.PANEL_DEBUG === "1" ||
    process.env.PANEL_DEBUG === "true" ||
    process.env.APP_DEBUG === "1" ||
    process.env.APP_DEBUG === "true",
  unitPrefix: (process.env.UNIT_PREFIX?.trim().toLowerCase() === "decimal"
    ? "decimal"
    : "binary") as "binary" | "decimal",
  navigationType: (() => {
    const v = process.env.NAVIGATION_TYPE?.trim().toLowerCase() || "mixed";
    return v === "sidebar" || v === "topbar" || v === "mixed" ? v : "mixed";
  })() as "sidebar" | "topbar" | "mixed",
  displayWidth: (() => {
    const v = process.env.DISPLAY_WIDTH?.trim().toLowerCase() || "xl";
    return v === "2xl" || v === "full" || v === "xl" ? v : "xl";
  })() as "xl" | "2xl" | "full",
  trustProxy: process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1",
  trustedProxies: (process.env.TRUSTED_PROXIES || "127.0.0.1,::1,::ffff:127.0.0.1").trim(),
  rootDir,
};

if (config.sessionSecret === "dev-session-secret-change-me" || config.sessionSecret.length < 16) {
  const msg = "[guartrix] SESSION_SECRET is weak/default — set a long random value in .env";
  if (
    process.env.ALLOW_INSECURE_DEFAULTS === "1" ||
    process.env.ALLOW_INSECURE_DEFAULTS === "true"
  ) {
    console.warn(msg);
  } else {
    console.error(msg);
    console.error(
      "[guartrix] Refusing to start. Set SESSION_SECRET or ALLOW_INSECURE_DEFAULTS=1 for local dev.",
    );
    process.exit(1);
  }
}
if (config.adminPassword === "changeme") {
  const msg = "[guartrix] ADMIN_PASSWORD is the default — change it in .env";
  if (
    process.env.ALLOW_INSECURE_DEFAULTS === "1" ||
    process.env.ALLOW_INSECURE_DEFAULTS === "true"
  ) {
    console.warn(msg);
  } else {
    console.error(msg);
    console.error(
      "[guartrix] Refusing to start. Set ADMIN_PASSWORD or ALLOW_INSECURE_DEFAULTS=1 for local dev.",
    );
    process.exit(1);
  }
}

export function serverDir(serverId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(serverId)) {
    throw new Error("Invalid server id");
  }
  return path.join(config.dataDir, "servers", serverId);
}

export function backupsRootDir(): string {
  return path.join(config.dataDir, "backups");
}

export function serverBackupsDir(serverId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(serverId)) {
    throw new Error("Invalid server id");
  }
  return path.join(backupsRootDir(), serverId);
}
