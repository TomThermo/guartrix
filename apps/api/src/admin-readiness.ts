/**
 * Admin go-live / SaaS readiness checks (live signals + operator attestations).
 */
import { config } from "./config.js";
import { isSmtpConfigured } from "./mail.js";
import { getRedisStatus, isRedisConfigured } from "./redis.js";
import { readStoredSettings } from "./panel-settings.js";

export type ReadinessTone = "pass" | "warn" | "fail" | "info";

export type ReadinessCheck = {
  id: string;
  tone: ReadinessTone;
  /** Settings tab deep-link hint */
  tab?: "general" | "mail" | "security" | "alerts" | "golive";
  detail?: string;
};

export type SlaAttestation = {
  restoreDrillAt?: string | null;
  incidentRunbookAck?: boolean;
  pentestScheduledOrDone?: boolean;
  capacityReviewAt?: string | null;
};

export type ReadinessReport = {
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number; info: number };
  checks: ReadinessCheck[];
  sla: SlaAttestation;
  jobs?: {
    mode: "bullmq" | "in_process";
    redisRequired: boolean;
    queues?: Array<{
      name: string;
      waiting: number;
      active: number;
      failed: number;
      delayed: number;
    }>;
  };
};

function trustProxyEnabled(): boolean {
  return (
    process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1"
  );
}

function daemonJwtLegacy(): boolean {
  const v = (process.env.DAEMON_JWT_LEGACY ?? "false").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export async function buildReadinessReport(opts?: {
  jobs?: ReadinessReport["jobs"];
}): Promise<ReadinessReport> {
  const stored = await readStoredSettings();
  const redis = await getRedisStatus();
  const smtpOk = isSmtpConfigured();
  const roles = config.twoFactorRequiredRoles.map((r) => r.toUpperCase());
  const admin2fa = roles.includes("ADMIN");
  const registrationOpen = config.registrationEnabled;
  const webhook = config.alerts.webhookUrl.trim();
  const alertEmail = config.alerts.alertEmail.trim();
  const https =
    process.env.HTTPS_ENABLED === "true" ||
    process.env.HTTPS_ENABLED === "1" ||
    config.sessionSecure ||
    (config.publicBaseUrl || "").startsWith("https://");

  const checks: ReadinessCheck[] = [];

  checks.push({
    id: "invite_email_verified",
    tone: "pass",
    detail: "Invite accept requires emailVerified (enforced in API)",
  });

  if (smtpOk) {
    checks.push({
      id: "smtp",
      tone: "pass",
      tab: "mail",
      detail: `SMTP host ${config.mail.smtpHost}`,
    });
  } else if (registrationOpen) {
    checks.push({
      id: "smtp",
      tone: "fail",
      tab: "mail",
      detail:
        "Registration is open but SMTP is not configured — verify-before-login is inactive",
    });
  } else {
    checks.push({
      id: "smtp",
      tone: "warn",
      tab: "mail",
      detail: "SMTP unset — mail goes to data/mail-outbox/; OK if registration stays closed",
    });
  }

  checks.push({
    id: "registration",
    tone: registrationOpen ? (smtpOk ? "warn" : "fail") : "pass",
    tab: "general",
    detail: registrationOpen
      ? "Self-serve registration is enabled"
      : "Registration closed",
  });

  checks.push({
    id: "https_session",
    tone: https && config.sessionSecure ? "pass" : "fail",
    tab: "security",
    detail: `HTTPS=${https ? "on" : "off"}, SESSION_SECURE=${config.sessionSecure}`,
  });

  checks.push({
    id: "trust_proxy",
    tone: trustProxyEnabled() ? "pass" : "warn",
    tab: "security",
    detail: trustProxyEnabled()
      ? "TRUST_PROXY enabled"
      : "TRUST_PROXY unset — set behind prod-web / reverse proxy",
  });

  checks.push({
    id: "admin_2fa",
    tone: admin2fa ? "pass" : "fail",
    tab: "security",
    detail: admin2fa
      ? "TWO_FACTOR_REQUIRED_ROLES includes ADMIN"
      : "Require TOTP for ADMIN under Security settings",
  });

  if (!isRedisConfigured()) {
    checks.push({
      id: "redis",
      tone: "warn",
      tab: "security",
      detail: "Redis not configured — single-API only (OK for one panel process)",
    });
  } else if (redis.connected) {
    checks.push({
      id: "redis",
      tone: "pass",
      tab: "security",
      detail: `Redis connected${redis.latencyMs != null ? ` (${redis.latencyMs} ms)` : ""}`,
    });
  } else {
    checks.push({
      id: "redis",
      tone: "fail",
      tab: "security",
      detail: redis.error || "REDIS_URL set but not connected",
    });
  }

  if (webhook || alertEmail) {
    checks.push({
      id: "alerts",
      tone: "pass",
      tab: "alerts",
      detail: [
        webhook ? "webhook set" : null,
        alertEmail ? "alert email set" : null,
      ]
        .filter(Boolean)
        .join(", "),
    });
  } else {
    checks.push({
      id: "alerts",
      tone: "warn",
      tab: "alerts",
      detail: "No activity webhook or alert email — crashes may go unnoticed",
    });
  }

  checks.push({
    id: "daemon_jwt_legacy",
    tone: daemonJwtLegacy() ? "fail" : "pass",
    detail: daemonJwtLegacy()
      ? "DAEMON_JWT_LEGACY=true — migrate nodes to JWT and disable legacy bearer"
      : "Daemon JWT legacy bearer disabled",
  });

  checks.push({
    id: "scheduler_locks",
    tone: isRedisConfigured()
      ? redis.connected
        ? "pass"
        : "fail"
      : "info",
    tab: "security",
    detail: isRedisConfigured()
      ? "Scheduler/bridge locks use Redis (fail-closed when Redis enabled)"
      : "No Redis — in-process scheduler (single API instance)",
  });

  const sla: SlaAttestation = {
    restoreDrillAt: stored.slaRestoreDrillAt ?? null,
    incidentRunbookAck: Boolean(stored.slaIncidentRunbookAck),
    pentestScheduledOrDone: Boolean(stored.slaPentestAck),
    capacityReviewAt: stored.slaCapacityReviewAt ?? null,
  };

  if (sla.restoreDrillAt) {
    checks.push({
      id: "sla_restore_drill",
      tone: "pass",
      tab: "golive",
      detail: `Restore drill attested at ${sla.restoreDrillAt}`,
    });
  } else {
    checks.push({
      id: "sla_restore_drill",
      tone: "info",
      tab: "golive",
      detail: "Operator attestation: panel DB restore drill not recorded",
    });
  }

  checks.push({
    id: "sla_incident_runbook",
    tone: sla.incidentRunbookAck ? "pass" : "info",
    tab: "golive",
    detail: sla.incidentRunbookAck
      ? "Incident runbook acknowledged"
      : "Acknowledge the SLA incident runbook when ready",
  });

  checks.push({
    id: "sla_pentest",
    tone: sla.pentestScheduledOrDone ? "pass" : "info",
    tab: "golive",
    detail: sla.pentestScheduledOrDone
      ? "External pentest scheduled or completed (operator attested)"
      : "External pentest is process — not auto-verified",
  });

  if (opts?.jobs) {
    const j = opts.jobs;
    if (j.mode === "bullmq") {
      const failed = (j.queues ?? []).reduce((n, q) => n + q.failed, 0);
      checks.push({
        id: "jobs",
        tone: failed > 0 ? "warn" : "pass",
        tab: "golive",
        detail:
          failed > 0
            ? `BullMQ active; ${failed} failed job(s) in DLQ/failed`
            : "BullMQ job queues active (HA-safe with Redis)",
      });
    } else {
      checks.push({
        id: "jobs",
        tone: isRedisConfigured() ? "warn" : "info",
        tab: "golive",
        detail: isRedisConfigured()
          ? "Redis is up but jobs still in-process — enable BullMQ worker path"
          : "In-process scheduler (single API) — configure Redis + BullMQ for HA",
      });
    }
  }

  const summary = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) summary[c.tone] += 1;

  return {
    generatedAt: new Date().toISOString(),
    summary,
    checks,
    sla,
    jobs: opts?.jobs,
  };
}
