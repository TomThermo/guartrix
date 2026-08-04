import type { WikiArticle } from "./wiki-types";

export const wikiArticles: WikiArticle[] = [
  {
    slug: "install-panel",
    title: "Install the panel",
    summary:
      "Set up Guartrix on an Ubuntu VPS with Docker, Node.js, MySQL, optional Redis, and first-boot guidance.",
    category: "Getting started",
    keywords: ["install", "ubuntu", "vps", "mysql", "redis", "https", "setup"],
    sourcePath: "docs/wiki/install-panel.md",
    relatedSlugs: ["install-nodes", "operations", "security"],
    sections: [
      {
        title: "What you need",
        paragraphs: [
          "Guartrix is designed for a fresh x86_64 Ubuntu VPS with a public IPv4 address.",
          "You need root access or passwordless sudo so the installer can configure Docker, Node.js, services, and firewall settings.",
        ],
      },
      {
        title: "Installer flow",
        bullets: [
          "Download `install-panel.sh` instead of piping it directly into bash.",
          "Choose full panel, panel-only, or daemon-only mode.",
          "Pick HTTP or HTTPS, then configure panel MySQL and optional Redis.",
          "Let the script write `.env`, build the app, and enable systemd services.",
        ],
        code: [
          {
            label: "Download the installer",
            language: "bash",
            content:
              "curl -Lo /tmp/guartrix-install.sh \\\n  https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh",
          },
          {
            label: "Run it",
            language: "bash",
            content: "sudo bash /tmp/guartrix-install.sh",
          },
          {
            label: "Fast HTTP setup example",
            language: "bash",
            content: "sudo bash /tmp/guartrix-install.sh --http --ip YOUR.PUBLIC.IP",
          },
        ],
      },
      {
        title: "After install",
        bullets: [
          "Sign in as `admin` with the configured bootstrap password.",
          "Activate a license if you do not want the free-tier limits.",
          "Verify that the local node is online under Admin -> System.",
          "Use the node guide when you want to add remote capacity.",
        ],
      },
    ],
  },
  {
    slug: "install-nodes",
    title: "Install nodes",
    summary:
      "Add remote daemon nodes with the admin wizard or a manual install command, then connect them to the panel securely.",
    category: "Getting started",
    keywords: ["nodes", "daemon", "remote install", "ssh", "sftp", "firewall"],
    sourcePath: "docs/wiki/install-nodes.md",
    relatedSlugs: ["install-panel", "networking-allocations", "daemon-api"],
    sections: [
      {
        title: "Admin wizard",
        paragraphs: [
          "Admins can create a node from the System page, fill in connection details, and run the remote install wizard over SSH.",
          "SSH credentials are used once for installation and are not stored by the panel.",
        ],
      },
      {
        title: "Manual install",
        bullets: [
          "Run `install-daemon.sh` on the remote VPS.",
          "Pass the node token, node id, panel URL, and public host values.",
          "Expose the daemon API, SFTP, and assigned game ports through the firewall.",
        ],
        code: [
          {
            label: "Download from your panel",
            language: "bash",
            content: "curl -Lo /tmp/guartrix-daemon.sh https://YOUR_PANEL/install-daemon.sh",
          },
          {
            label: "Run the remote installer",
            language: "bash",
            content:
              "sudo bash /tmp/guartrix-daemon.sh \\\n  --token NODE_TOKEN \\\n  --node-id NODE_ID \\\n  --fqdn NODE_PUBLIC_IP \\\n  --port 8081 \\\n  --panel https://YOUR_PANEL",
          },
        ],
      },
      {
        title: "Security model",
        paragraphs: [
          "The panel stores a long-lived node secret, but control traffic uses short-lived daemon JWTs on the wire.",
          "Docker access on the node is still a high-trust surface, so passwordless sudo or Docker group membership should be treated carefully.",
        ],
      },
    ],
  },
  {
    slug: "panel-guide",
    title: "Panel guide",
    summary:
      "A visual tour of the web panel, including login, dashboard, account pages, admin pages, and the full server detail workspace.",
    category: "Using the panel",
    keywords: ["ui", "dashboard", "server detail", "admin", "screenshots"],
    sourcePath: "docs/wiki/panel-guide.md",
    relatedSlugs: [
      "accounts-quotas",
      "server-management",
      "files-backups",
      "networking-allocations",
    ],
    sections: [
      {
        title: "Public and account pages",
        bullets: [
          "Login, register, password reset, and invite acceptance are all part of the public account flow.",
          "Account -> Security includes TOTP, API keys, app passwords, push settings, and appearance options.",
          "Account -> Billing covers plan purchases and subscription visibility.",
        ],
      },
      {
        title: "Admin surfaces",
        bullets: [
          "Admins get Status, Settings, System, License, Activity, Billing, and Users.",
          "These pages cover health, panel settings, node management, licensing, payments, and account administration.",
        ],
      },
      {
        title: "Server workspace",
        paragraphs: [
          "The server detail page is the main operating surface for console, files, SFTP, databases, network, backups, schedules, activity, and game-specific tools.",
          "Header actions expose version changes, software-family changes, reinstall, clone, transfer, and ownership changes.",
        ],
      },
    ],
  },
  {
    slug: "accounts-quotas",
    title: "Accounts and quotas",
    summary:
      "Understand roles, registration, verification, password reset, TOTP, subusers, API keys, account export, and quota-based access.",
    category: "Using the panel",
    keywords: ["accounts", "roles", "quotas", "2fa", "subusers", "api keys"],
    sourcePath: "docs/wiki/accounts-and-quotas.md",
    relatedSlugs: ["security", "client-api", "application-billing"],
    sections: [
      {
        title: "Roles",
        bullets: [
          "Admins manage the whole platform.",
          "Operators manage their own servers within assigned quotas.",
          "Viewers are read-oriented accounts and cannot create servers.",
        ],
      },
      {
        title: "Quota model",
        paragraphs: [
          "New accounts start with zero server, RAM, and database quota unless an admin or billing flow grants capacity.",
          "Quota is the main gate that controls who can create and scale servers.",
        ],
      },
      {
        title: "Security and delegation",
        bullets: [
          "TOTP can be optional or required for selected roles.",
          "Subusers receive fine-grained per-server permissions.",
          "Client API keys and app passwords extend account access for scripts and SFTP clients.",
        ],
      },
    ],
  },
  {
    slug: "server-management",
    title: "Server management",
    summary:
      "Create, import, clone, move, reinstall, power-control, and configure servers from the dashboard and server detail page.",
    category: "Using the panel",
    keywords: ["servers", "create", "import", "clone", "reinstall", "transfer", "power"],
    sourcePath: "docs/wiki/server-management.md",
    relatedSlugs: ["files-backups", "networking-allocations", "mods-modpacks"],
    sections: [
      {
        title: "Lifecycle actions",
        bullets: [
          "Create or import a server from the New server flow.",
          "Clone or reinstall from the server header actions.",
          "Move a stopped server to another node when capacity or location changes.",
          "Use start, stop, restart, and kill for day-to-day power control.",
        ],
      },
      {
        title: "Main tabs",
        paragraphs: [
          "The server detail page combines service tabs, game tabs, and management tabs in one workspace.",
          "This includes console, files, SFTP, databases, network, backups, subusers, settings, players, bans, schedules, activity, logs, resources, and optional bots.",
        ],
      },
      {
        title: "State model",
        paragraphs: [
          "Visible states like OFFLINE, STARTING, RUNNING, STOPPING, ERROR, and TRANSFERRING reflect coordination between the panel and the daemon.",
          "Quota, disk, and licensing rules can block starts or force recovery actions.",
        ],
      },
    ],
  },
  {
    slug: "files-backups",
    title: "Files and backups",
    summary:
      "Manage server files through the browser or SFTP, and use backup and restore flows for safe recovery.",
    category: "Using the panel",
    keywords: ["files", "sftp", "upload", "download", "backups", "restore", "archives"],
    sourcePath: "docs/wiki/files-and-backups.md",
    relatedSlugs: ["server-management", "networking-allocations", "operations"],
    sections: [
      {
        title: "File manager",
        bullets: [
          "Browse, edit, upload, download, create folders, and archive selected files in the browser.",
          "Use the web file manager for quick configuration changes and one-off file operations.",
        ],
      },
      {
        title: "SFTP",
        paragraphs: [
          "SFTP uses the same server data directory but is better for large or repeated transfers from desktop tools.",
          "You log in with `{panelUsername}.{serverId}` and either the account password or an app password.",
        ],
      },
      {
        title: "Backup and restore",
        bullets: [
          "Create manual backups or schedule them later.",
          "Download, upload, restore, and delete backup archives from the panel.",
          "Safety-sensitive flows like reinstall and transfer can create backups before destructive actions.",
        ],
      },
    ],
  },
  {
    slug: "networking-allocations",
    title: "Networking and allocations",
    summary:
      "Track node ports, assign primary and extra allocations, and keep Docker publish rules and firewall state aligned.",
    category: "Using the panel",
    keywords: ["network", "allocations", "ports", "firewall", "geyser", "nodes"],
    sourcePath: "docs/wiki/networking-and-allocations.md",
    relatedSlugs: ["install-nodes", "server-management", "daemon-api"],
    sections: [
      {
        title: "Allocation model",
        paragraphs: [
          "Allocations are the panel's inventory of free and assigned `IP:port` pairs on each node.",
          "Every server has a primary game port and can optionally have extra TCP or UDP allocations.",
        ],
      },
      {
        title: "Operational behavior",
        bullets: [
          "Changing published ports usually requires a restart so Docker can rebind them.",
          "Assigning or removing ports can trigger firewall changes on the node.",
          "Optional helpers can add a UDP companion port for query or Geyser-style use cases.",
        ],
      },
      {
        title: "Node connectivity",
        paragraphs: [
          "Node records also store daemon connection details and optional public/SFTP hostnames.",
          "Those values affect remote install commands, health checks, and how the panel reaches each node.",
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
          "Docker access on a game node is a high-trust boundary and should be treated accordingly.",
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
    slug: "client-api",
    title: "Client API",
    summary:
      "Use personal `gt_` API keys for scripts, CI, and limited server automation without a browser session.",
    category: "Integrations",
    keywords: ["api", "client api", "gt_", "bearer", "automation", "permissions"],
    sourcePath: "docs/wiki/client-api.md",
    relatedSlugs: ["accounts-quotas", "application-billing", "security"],
    sections: [
      {
        title: "How it works",
        paragraphs: [
          "Client API keys are personal bearer tokens created from Account -> Security.",
          "Each key can carry specific permission scopes and optional server restrictions.",
        ],
      },
      {
        title: "Typical use",
        bullets: [
          "List servers visible to the account.",
          "Run power actions such as restart or stop.",
          "Read or write files if the key includes the matching permissions.",
          "Inspect or run scheduled tasks.",
        ],
      },
      {
        title: "Security model",
        bullets: [
          "Treat `gt_` keys like passwords.",
          "Use least privilege and revoke unused keys quickly.",
          "Keys do not replace browser-only account management actions.",
        ],
      },
    ],
  },
  {
    slug: "application-billing",
    title: "Application API and billing",
    summary:
      "Combine first-party Mollie billing with admin machine keys for users, servers, plans, and payment automation.",
    category: "Integrations",
    keywords: ["application api", "billing", "mollie", "gta_", "plans", "payments"],
    sourcePath: "docs/wiki/application-api.md",
    relatedSlugs: ["client-api", "accounts-quotas", "licensing"],
    sections: [
      {
        title: "Two automation models",
        paragraphs: [
          "The built-in billing flow uses Mollie for checkout and subscriptions.",
          "The Application API lets an external system raise quotas, create users, and provision servers with `gta_` machine keys.",
        ],
      },
      {
        title: "Plan templates",
        bullets: [
          "Plans define pricing, quotas, recurring behavior, and optional auto-create-server defaults.",
          "Payments ultimately change the same quota model used by admins.",
        ],
      },
      {
        title: "Operational expectations",
        bullets: [
          "Mollie webhooks must be reachable from the public internet.",
          "Recurring plans can create local subscription state and later revoke entitlements on failed renewal flows.",
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
          "Build the project and use `bash scripts/start.sh` for normal production restarts.",
          "That script handles preflight checks, process startup, and watchdog attachment.",
        ],
      },
      {
        title: "Watchdog and health",
        bullets: [
          "The watchdog checks API and daemon liveness/readiness.",
          "It restarts unhealthy panel processes without intentionally killing Minecraft containers.",
          "Webhook alerts can fire when restart loops or critical backoff events happen.",
        ],
      },
      {
        title: "Data and backups",
        bullets: [
          "Panel DB backups can be run manually or via an installed daily timer.",
          "Runtime data such as logs, sessions, node credentials, and backup archives live under `data/`.",
        ],
      },
    ],
  },
];

export const wikiArticlesBySlug = new Map(wikiArticles.map((article) => [article.slug, article]));

export const wikiCategories = Array.from(
  new Set(wikiArticles.map((article) => article.category)),
);

function articleSearchText(article: WikiArticle): string {
  const sectionText = article.sections
    .flatMap((section) => [
      section.title,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      ...((section.code ?? []).flatMap((block) => [block.label ?? "", block.content])),
    ])
    .join(" ");
  return [
    article.title,
    article.summary,
    article.category,
    article.keywords.join(" "),
    sectionText,
  ]
    .join(" ")
    .toLowerCase();
}

export function searchWikiArticles(query: string, category?: string): WikiArticle[] {
  const normalizedQuery = query.trim().toLowerCase();
  return wikiArticles.filter((article) => {
    if (category && category !== "All" && article.category !== category) return false;
    if (!normalizedQuery) return true;
    return articleSearchText(article).includes(normalizedQuery);
  });
}
