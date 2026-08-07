import type { WikiArticle } from "../wiki-types";
import { wikiAsset } from "../wiki-assets";

export const operationsArticles: WikiArticle[] = [
  {
    slug: "statusline",
    title: "Status overview",
    summary:
      "Admin → Status health board for web, API, watchdog, Redis, and every game node.",
    category: "Operations",
    keywords: ["status", "statusline", "health", "watchdog", "nodes"],
    sourcePath: "docs/wiki/statusline.md",
    relatedSlugs: ["operations", "install-nodes", "scaling"],
    sections: [
      {
        title: "What you see",
        bullets: [
          "Architecture strip and version vs license channel",
          "Web, API, watchdog, and Redis cards",
          "Per-node reachability, containers, CPU/RAM, MySQL",
          "System log tails",
        ],
        images: [
          {
            src: wikiAsset("07-statusline.png"),
            alt: "Admin Status page",
            caption: "Live health overview for the panel stack and nodes.",
          },
        ],
      },
    ],
  },
  {
    slug: "security",
    title: "Security",
    summary:
      "Review the main hardening controls for sessions, proxy trust, daemon auth, SFTP jail, secrets, and host exposure.",
    category: "Operations",
    keywords: ["security", "sessions", "csrf", "daemon jwt", "sftp", "rotation", "cloudflare"],
    sourcePath: "docs/wiki/security.md",
    relatedSlugs: ["accounts-quotas", "daemon-api", "license-flow"],
    sections: [
      {
        title: "Main controls",
        bullets: [
          "Cookie-authenticated writes use CSRF checks.",
          "Trusted proxy handling is explicit and restricted.",
          "Sessions are httpOnly and can move to Redis for multi-API setups.",
          "SFTP and file access are jailed to the server directory.",
        ],
      },
      {
        title: "Secret rotation",
        paragraphs: [
          "Session secrets, daemon tokens, MySQL credentials, API keys, provider tokens, and TLS keys all have different blast radiuses and rotation steps.",
          "Rotating the session secret also affects sealed node tokens, TOTP secrets, and some stored database passwords.",
        ],
      },
      {
        title: "Host and supply-chain risk",
        bullets: [
          "Remote install convenience scripts remain a residual supply-chain risk if used without pinning.",
          "Prefer preseed Docker Engine + Node 22 on each node so install-daemon.sh skips curl|sh.",
          "Docker access on a game node is a high-trust boundary and should be treated accordingly.",
        ],
      },
      {
        title: "Daemon JWT defaults",
        paragraphs: [
          "Panel→daemon auth uses short-lived HS256 JWTs signed with DAEMON_TOKEN. Keep DAEMON_JWT_LEGACY=false after migration.",
        ],
        bullets: [
          "DAEMON_JWT_TTL default 900 (HTTP access JWT seconds).",
          "DAEMON_JWT_WS_TTL default 3600 (WebSocket JWT seconds).",
          "DAEMON_JWT_LEGACY default false — raw long-lived bearer is deprecated.",
          "Rotate node tokens from System → Nodes if a token may have leaked; use TLS on public daemon URLs.",
          "ACTIVITY_WEBHOOK_URL and BILLING_WEBHOOK_URL use DNS-pinned fetchSafeWebhook (SSRF-safe).",
        ],
      },
    ],
  },
  {
    slug: "licensing",
    title: "Licensing",
    summary:
      "Connect the panel to the public license API, understand free-tier fallback, and see how the daemon enforces signed ticket limits.",
    category: "Operations",
    keywords: ["license", "free tier", "validate", "ticket", "limits", "features"],
    sourcePath: "docs/wiki/licensing.md",
    relatedSlugs: ["license-flow", "security", "install-panel"],
    sections: [
      {
        title: "What licensing controls",
        bullets: [
          "Node count, server count, RAM allowance, and selected feature availability.",
          "Admin -> License shows status, key, limits, and current usage.",
        ],
      },
      {
        title: "Free-tier fallback",
        paragraphs: [
          "If the key is missing, invalid, revoked, or beyond the grace window, the panel falls back to 1 node, 1 server, and 10 GB disk per server.",
          "The website remains online even when the license is not valid.",
        ],
      },
      {
        title: "Daemon enforcement",
        paragraphs: [
          "The daemon verifies signed license tickets locally, so enforcement is not only a UI concern.",
          "Starts and restarts can be blocked even if the panel stays online.",
        ],
      },
    ],
  },
  {
    slug: "panel-settings",
    title: "Panel settings",
    summary:
      "Configure public URLs, registration, SMTP, security flags, Redis visibility, alerts, and the Go-live readiness tab from Admin -> Settings.",
    category: "Operations",
    keywords: [
      "settings",
      "smtp",
      "registration",
      "redis",
      "alerts",
      "public host",
      "go-live",
      "sla",
    ],
    sourcePath: "docs/wiki/panel-settings.md",
    relatedSlugs: ["sla-ops", "security", "operations", "notifications-alerts"],
    sections: [
      {
        title: "What it controls",
        bullets: [
          "General settings like public host, base URL, registration, and default quotas.",
          "Mail settings including SMTP and test mail.",
          "Security settings such as HTTPS flags and 2FA-required roles.",
          "Alert delivery settings such as activity webhook and alert email.",
          "Go-live: live readiness checks, BullMQ job status, and SLA operator attestations.",
        ],
      },
      {
        title: "Storage and apply behavior",
        paragraphs: [
          "Overrides are stored in `data/panel-settings.json` and merged on top of `.env`.",
          "Public host, base URL, HTTPS, and session-secure changes also patch `.env` and require a restart, while many other values apply immediately to the API.",
        ],
      },
    ],
  },
  {
    slug: "sla-ops",
    title: "SLA ops",
    summary:
      "Templates for managed SaaS posture: HA env, incident steps, restore/secret drills, monitoring, and pentest process.",
    category: "Operations",
    keywords: [
      "sla",
      "go-live",
      "bullmq",
      "require_redis_ha",
      "restore drill",
      "pentest",
      "rto",
      "rpo",
    ],
    sourcePath: "docs/wiki/sla-ops.md",
    relatedSlugs: ["panel-settings", "scaling", "security", "upgrade-to-1.2"],
    sections: [
      {
        title: "Engineering gates",
        bullets: [
          "REQUIRE_REDIS_HA / PANEL_HA refuse boot without Redis + BullMQ + redis session/rate stores.",
          "TRANSFER_ALLOW_PANEL_STAGING defaults off (peer-only node transfers).",
          "Admin → Go-live shows live checks and operator attestations.",
        ],
      },
      {
        title: "Operator drills",
        bullets: [
          "bash scripts/sla-restore-drill.sh (--restore-latest for staging MySQL)",
          "bash scripts/sla-secret-rotation-drill.sh",
          "bash scripts/scale-smoke.sh",
          "Record dates under Go-live; keep pentest ack false until an external assessment exists.",
        ],
      },
      {
        title: "Also see",
        bullets: [
          "SLA contract template and Prometheus alert example in the docs wiki.",
          "Pentest scope brief for independent assessors.",
        ],
      },
    ],
  },
  {
    slug: "activity-log",
    title: "Activity log",
    summary:
      "Track power actions, settings changes, files, backups, subusers, auth events, and node/system activity across the platform.",
    category: "Operations",
    keywords: ["activity", "audit", "events", "filters", "alerts", "retention"],
    sourcePath: "docs/wiki/activity-log.md",
    relatedSlugs: ["notifications-alerts", "security", "server-management"],
    sections: [
      {
        title: "What is recorded",
        paragraphs: [
          "Guartrix records actor, target, IP, success/failure, and action metadata for many server, account, and admin operations.",
          "The same underlying activity stream feeds the per-server Activity tab and the global admin Activity page.",
        ],
      },
      {
        title: "Operational behavior",
        bullets: [
          "Retention is controlled by `ACTIVITY_LOG_RETENTION_DAYS`.",
          "Critical actions can also trigger webhook or email notifications.",
          "Shared action keys live in the shared package so labels stay consistent between API and UI.",
        ],
      },
    ],
  },
  {
    slug: "scaling",
    title: "Scaling and Redis",
    summary:
      "Understand the supported scale model, when Redis is needed, and how sessions, rate limits, transfers, and event fan-out behave.",
    category: "Operations",
    keywords: ["scaling", "redis", "multi-api", "ha", "sessions", "rate limits"],
    sourcePath: "docs/wiki/scaling.md",
    relatedSlugs: ["install-panel", "security", "operations"],
    sections: [
      {
        title: "Default scale model",
        paragraphs: [
          "The normal supported pattern is one panel and one or more daemon nodes.",
          "You only need Redis when you move beyond a single panel API process and want multi-API high availability.",
        ],
      },
      {
        title: "What Redis covers",
        bullets: [
          "Shared sessions",
          "Shared rate limits",
          "Transfer state",
          "Scheduler leader lock",
          "Backup busy lock (BACKUP_BUSY_TTL_MS)",
          "Daemon /events single-primary bridge lock + fan-out",
          "Console and event pub/sub across API replicas",
          "BullMQ job queues (backups, schedules, transfers, disk-watch, maintenance)",
        ],
      },
      {
        title: "Managed HA flag",
        paragraphs: [
          "Set REQUIRE_REDIS_HA=1 (or PANEL_HA=1) so the API refuses to start without Redis + BullMQ and redis-backed session/rate stores.",
        ],
      },
    ],
  },
  {
    slug: "upgrade-to-1.1",
    title: "Upgrade to 1.1",
    summary:
      "Upgrade an existing 1.0.x panel to Guartrix 1.1.0: env knobs, migrate, rebuild, and scale smoke.",
    category: "Operations",
    keywords: ["upgrade", "1.1", "migrate", "scale", "redis", "rate limit"],
    sourcePath: "docs/wiki/upgrade-to-1.1.md",
    relatedSlugs: ["upgrade-to-1.2", "scaling", "operations", "env-reference"],
    sections: [
      {
        title: "What 1.1.0 means",
        paragraphs: [
          "Control-plane scale work for ~100 nodes / ~1000 servers on one strong panel (batched schedules, pagination, Redis locks, daemon event bridge, server list indexes).",
        ],
      },
      {
        title: "Steps",
        bullets: [
          "Backup panel DB and data/ (tokens, sessions, license).",
          "Pull or unpack 1.1.0.",
          "Merge new env knobs (API_SESSION_READ_RATE_LIMIT, BACKUP_BUSY_TTL_MS, DAEMON_BRIDGE_*, ACTIVITY_LOG_RETENTION_DAYS, …).",
          "npm run db:generate && bash scripts/db-migrate.sh",
          "Rebuild and restart (operator: build-out + build/start.sh).",
          "Smoke with scripts/scale-smoke.sh and /api/ready + daemon /ready.",
        ],
      },
      {
        title: "Known limits in 1.1",
        bullets: [
          "World transfers prefer node→node; from 1.2 panel staging is opt-in only.",
          "Stats history lives on the daemon (lost if that node restarts).",
          "Still load-test your fleet size before go-live.",
        ],
      },
    ],
  },
  {
    slug: "upgrade-to-1.2",
    title: "Upgrade to 1.2",
    summary:
      "Upgrade 1.1.x to 1.2 SaaS/SLA: Go-live, BullMQ, /api/v1, peer-only transfers, HA flag.",
    category: "Operations",
    keywords: [
      "upgrade",
      "1.2",
      "saas",
      "sla",
      "bullmq",
      "api/v1",
      "go-live",
      "transfer",
    ],
    sourcePath: "docs/wiki/upgrade-to-1.2.md",
    relatedSlugs: ["sla-ops", "upgrade-to-1.1", "scaling", "panel-settings"],
    sections: [
      {
        title: "What 1.2 adds",
        bullets: [
          "Admin → Go-live readiness and SLA attestations",
          "BullMQ jobs + REQUIRE_REDIS_HA boot gate",
          "Stable /api/v1 dual-mount",
          "Peer-only transfers by default (TRANSFER_ALLOW_PANEL_STAGING=0)",
          "Owner aggregate API_OWNER_RATE_LIMIT",
        ],
      },
      {
        title: "After upgrade",
        bullets: [
          "Merge env knobs from .env.example",
          "Rebuild/restart, then bash scripts/scale-smoke.sh",
          "Run restore/secret drills and attest under Go-live",
        ],
      },
    ],
  },
  {
    slug: "operations",
    title: "Operations",
    summary:
      "Operate the production stack with the start script, watchdog, backups, ports, and public install endpoints.",
    category: "Operations",
    keywords: ["operations", "start", "watchdog", "backup", "ports", "health", "prod-web"],
    sourcePath: "docs/wiki/operations.md",
    relatedSlugs: ["install-panel", "security", "daemon-api"],
    sections: [
      {
        title: "Canonical restart flow",
        paragraphs: [
          "Pick one supervision model per host — never mix systemd units with the start.sh watchdog.",
          "Customer installs: `systemctl restart guartrix-api guartrix-web guartrix-daemon`.",
          "Operator checkouts: build and use `bash scripts/start.sh` (preflight, processes, watchdog).",
          "scripts/start.sh refuses to start when guartrix-*.service units are active unless ALLOW_MIXED_SUPERVISION=1.",
        ],
      },
      {
        title: "Operator health smoke",
        paragraphs: [
          "After restart, expect HTTP 200 from these local probes (adjust hosts/ports for your install):",
        ],
        code: [
          {
            label: "Health smoke",
            language: "bash",
            content:
              "curl -sf http://127.0.0.1:3001/api/health\ncurl -sf http://127.0.0.1:3001/api/ready\ncurl -sf http://127.0.0.1:8081/health\ncurl -sf http://127.0.0.1:8081/ready\ncurl -sfI http://127.0.0.1/",
          },
        ],
      },
      {
        title: "Watchdog and health",
        bullets: [
          "The watchdog checks API and daemon liveness/readiness.",
          "It restarts unhealthy panel processes without intentionally killing Minecraft containers.",
          "Webhook alerts can fire when restart loops or critical backoff events happen.",
          "Admin → Status (`/admin/status`) shows web, API, Redis, and per-node health.",
        ],
      },
      {
        title: "Data and backups",
        bullets: [
          "Panel DB backups can be run manually or via an installed daily timer.",
          "Local daemon env: `$INSTALL_DIR/data/daemon.env`. Remote: `/var/lib/guartrix/daemon.env`.",
          "Full Docker MySQL volume can hold panel + game DBs together — wipe carefully.",
        ],
      },
    ],
  },
];
