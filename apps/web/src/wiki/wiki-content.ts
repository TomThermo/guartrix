import type { WikiArticle } from "./wiki-types";

const wikiAssetUrls = import.meta.glob("../../../../docs/wiki/assets/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function wikiAsset(name: string): string {
  return wikiAssetUrls[`../../../../docs/wiki/assets/${name}`] ?? "";
}

export const wikiArticles: WikiArticle[] = [
  {
    slug: "overview",
    title: "Guartrix overview",
    summary:
      "A high-level introduction to the panel, daemon, supported server types, architecture, requirements, and documentation entry points.",
    category: "Overview",
    keywords: ["overview", "readme", "panel", "daemon", "architecture", "requirements", "stack", "node", "vite", "mysql", "docker", "react", "fastify"],
    sourcePath: "README.md",
    relatedSlugs: ["install-panel", "architecture", "panel-guide", "api-documentation", "api-surface-map"],
    sections: [
      {
        title: "What Guartrix is",
        paragraphs: [
          "Guartrix is a self-hosted panel and daemon stack for Minecraft hosting across one or more nodes.",
          "The panel provides the web UI and API, while daemons on nodes run Docker-backed game servers, SFTP, and optional node-local MySQL services.",
        ],
      },
      {
        title: "Supported server families",
        bullets: [
          "Vanilla",
          "Paper",
          "Purpur",
          "Fabric",
          "Quilt",
          "Forge",
          "NeoForge",
        ],
      },
      {
        title: "Tech stack",
        paragraphs: [
          "Guartrix is a Node.js 22+ / TypeScript monorepo. The web UI is React 19 built with Vite; the API is Fastify with Prisma on MySQL; each node runs a Fastify daemon that drives Docker game containers, SFTP, and optional node-local MySQL.",
        ],
        bullets: [
          "Runtime: Node.js 22+, TypeScript",
          "Web: React 19, Vite 6, React Router, Bootstrap 5",
          "API: Fastify 5, Prisma → panel MySQL",
          "Daemon / nodes: Docker Engine, SFTP (ssh2), node MySQL for game DBs",
          "Optional: Redis (HA), SMTP, Mollie, Sentry, Prometheus metrics",
          "Production: prod-web serves the Vite build and proxies /api and /ws",
        ],
      },
      {
        title: "Notable product features",
        bullets: [
          "Geyser one-click + Velocity/Bungee backend helpers (proxy not hosted by Guartrix)",
          "BlueMap / World Map, world reset & zip upload, resource packs",
          "Per-server MySQL databases, schedules, node transfer",
          "Admin Mineflayer bots (online-mode=false)",
          "Client API (`gt_`) and Application API / Mollie (`gta_`)",
          "Free tier without license: 1 node, 1 server, 10 GB disk",
        ],
      },
      {
        title: "Main documentation areas",
        bullets: [
          "Install and node setup",
          "Accounts, quotas, and security",
          "Server management, files, backups, and networking",
          "Client API, Application API, billing, and licensing",
          "Operations, scaling, and internal architecture",
        ],
      },
    ],
  },
  {
    slug: "architecture",
    title: "Architecture",
    summary:
      "Tech stack, monorepo layout, panel ↔ daemon flow, MySQL/Redis/Sentry notes, and trust boundaries.",
    category: "Overview",
    keywords: ["architecture", "stack", "vite", "fastify", "prisma", "docker", "redis", "sentry"],
    sourcePath: "docs/wiki/architecture.md",
    relatedSlugs: ["overview", "env-reference", "daemon-api", "scaling"],
    sections: [
      {
        title: "Stack",
        bullets: [
          "Node.js 22+ / TypeScript monorepo",
          "Web: React 19, Vite 6, Bootstrap",
          "API: Fastify 5, Prisma → MySQL",
          "Daemon: Fastify + node-agent (Docker, SFTP, game MySQL)",
          "Optional Redis, SMTP, Mollie, Sentry (API/daemon + VITE_SENTRY_DSN for browser), Prometheus metrics",
        ],
      },
      {
        title: "Request path",
        paragraphs: [
          "Browsers hit prod-web (:80/:443), which serves the Vite build and proxies `/api` and `/ws` to the API on localhost :3001.",
          "The API talks to daemons with short-lived HS256 JWTs. Game servers run as Docker containers on each node.",
        ],
      },
      {
        title: "MySQL layout",
        paragraphs: [
          "On a full Docker install, panel and game databases often share one `guartrix-mysql` container/volume — recreate carefully.",
          "Remote nodes run their own game MySQL. Local daemon env is under `data/daemon.env`; remote daemon-only uses `/var/lib/guartrix/daemon.env`.",
        ],
      },
    ],
  },
  {
    slug: "env-reference",
    title: "Environment variables",
    summary:
      "Panel `.env` and daemon env file knobs — paths differ for local vs remote nodes.",
    category: "Reference",
    keywords: ["env", "environment", "DATABASE_URL", "REDIS", "daemon.env", "registration"],
    sourcePath: "docs/wiki/env-reference.md",
    relatedSlugs: ["install-panel", "architecture", "operations"],
    sections: [
      {
        title: "Where config lives",
        bullets: [
          "Panel: repo root `.env` (from `.env.example`)",
          "Local daemon: `$INSTALL_DIR/data/daemon.env`",
          "Remote daemon-only: `/var/lib/guartrix/daemon.env`",
          "`REGISTRATION_ENABLED` controls open signup; `LETSENCRYPT_EMAIL` for LE helper scripts",
        ],
      },
      {
        title: "Common groups",
        bullets: [
          "Public URL / TLS: PUBLIC_*, HTTPS_*, SESSION_SECURE, TRUST_PROXY, TLS_*",
          "Database: DATABASE_URL / MYSQL_*",
          "Redis HA: REDIS_URL, SESSION_STORE, RATE_LIMIT_STORE",
          "License: LICENSE_SERVER_URL, LICENSE_KEY",
          "Bots: BOT_WORKER",
        ],
      },
    ],
  },
  {
    slug: "sftp",
    title: "SFTP",
    summary:
      "Per-node SFTP on port 2022 — username format, permissions, and FileZilla notes.",
    category: "Using the panel",
    keywords: ["sftp", "ftp", "files", "2022", "filezilla"],
    sourcePath: "docs/wiki/sftp.md",
    relatedSlugs: ["files-backups", "accounts-quotas", "security"],
    sections: [
      {
        title: "Connection",
        bullets: [
          "Protocol: SFTP (not FTP)",
          "Port: 2022",
          "Username: `{panelUsername}.{serverId}`",
          "Password: panel account password (or app password when required)",
        ],
      },
      {
        title: "Jail",
        paragraphs: [
          "Sessions are jailed to that server’s files directory. Subuser permissions still apply to what the panel allows over SFTP.",
        ],
      },
    ],
  },
  {
    slug: "release-builds",
    title: "Release builds and downloads",
    summary:
      "Minified customer bundles, password-protected /download zips, and what is stripped from ship trees.",
    category: "Reference",
    keywords: ["release", "download", "obfuscate", "zip", "customer"],
    sourcePath: "docs/wiki/release-builds.md",
    relatedSlugs: ["prod-web-downloads", "build-release-internals", "licensing"],
    sections: [
      {
        title: "Shipping",
        bullets: [
          "`build:release` / `build-out.sh` produce minified API/daemon bundles",
          "Operator download packaging publishes versioned zips for `/download`",
          "Customer trees omit git, sources, and the private license issuer",
        ],
      },
      {
        title: "Download portal",
        paragraphs: [
          "Optional DNS-only `DOWNLOAD_PUBLIC_HOST` avoids Cloudflare bot challenges on zip downloads.",
          "Set `DOWNLOAD_PASSWORD` and restart web after changing download env.",
        ],
      },
    ],
  },
  {
    slug: "databases",
    title: "Game databases",
    summary:
      "Create per-server MySQL databases on the node, understand quotas, and the shared Docker MySQL layout.",
    category: "Using the panel",
    keywords: ["mysql", "databases", "guartrix-mysql", "quota"],
    sourcePath: "docs/wiki/databases.md",
    relatedSlugs: ["server-management", "accounts-quotas", "install-panel"],
    sections: [
      {
        title: "Basics",
        bullets: [
          "Server → Databases creates a prefixed DB + user on the node MySQL",
          "Plugins usually connect to host `guartrix-mysql` inside Docker",
          "Owner quota `maxDatabases` (defaults often 0 until an admin raises it)",
        ],
        images: [
          {
            src: wikiAsset("13-server-databases.png"),
            alt: "Databases tab",
            caption: "Create and copy credentials for per-server MySQL databases.",
          },
        ],
      },
      {
        title: "Shared volume warning",
        paragraphs: [
          "On a full-panel Docker install, panel and game DBs often share `guartrix-mysql` and `data/mysql`. Wiping that volume deletes both.",
          "If panel MySQL is already on localhost:3306 externally, game MySQL publishes on host port 3307.",
        ],
      },
    ],
  },
  {
    slug: "bots",
    title: "Bots (Mineflayer)",
    summary:
      "Admin-only in-game bots — online-mode=false, Via*, BOT_WORKER, and available orders.",
    category: "Using the panel",
    keywords: ["bots", "mineflayer", "viaversion", "admin", "offline"],
    sourcePath: "docs/wiki/bots.md",
    relatedSlugs: ["server-management", "networking-allocations", "security"],
    sections: [
      {
        title: "Requirements",
        bullets: [
          "Admin-only tab",
          "Server must be RUNNING",
          "`online-mode=false`",
          "Via* recommended for non-native protocol versions",
          "`BOT_WORKER=1` (default) runs bots in a forked API child",
        ],
        images: [
          {
            src: wikiAsset("38-server-bots.png"),
            alt: "Bots tab",
            caption: "Spawn and command Mineflayer bots from the panel.",
          },
        ],
      },
      {
        title: "Orders",
        bullets: ["ai", "follow", "guard", "chop", "wander", "goto", "collect", "dig", "attack", "say", "stop", "quit"],
      },
    ],
  },
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
          "Choose full panel, panel-only, or daemon-only mode (flags: `--full` / `--panel-only` / `--daemon-only`).",
          "Pick HTTP or HTTPS (installer does not run Certbot — place Origin/TLS certs yourself).",
          "Configure panel MySQL (Docker default shares game DBs on full installs) and optional Redis.",
          "UFW opens 22/80 (and 443 if HTTPS; plus 2022 and 25565-25600 when a local daemon is installed).",
          "Let the script write `.env`, build the app, and enable systemd units `guartrix-api` / `guartrix-web` / `guartrix-daemon`.",
          "Blank license key → free tier (1 node, 1 server, 10 GB disk) until Admin → License.",
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
          "SSH credentials are used once for installation and are not stored by the panel. Default SSH user is often `ubuntu`; non-22 SSH ports are supported.",
          "On success the wizard auto-tests the daemon. Remote config is written to `/var/lib/guartrix/daemon.env`.",
        ],
      },
      {
        title: "Manual install",
        bullets: [
          "Download `install-daemon.sh` from your panel, then run it (do not pipe curl into bash).",
          "Pass the node token, node id, panel URL, public host, and optional `--sftp-port`.",
          "Expose the daemon API, SFTP, and assigned game ports through the firewall.",
          "Edit Docker knobs in `/var/lib/guartrix/daemon.env` (not `/opt/guartrix/data/daemon.env`).",
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
              "sudo bash /tmp/guartrix-daemon.sh \\\n  --token NODE_TOKEN \\\n  --node-id NODE_ID \\\n  --fqdn NODE_PUBLIC_IP \\\n  --port 8081 \\\n  --sftp-port 2022 \\\n  --panel https://YOUR_PANEL",
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
        images: [
          {
            src: wikiAsset("01-login.png"),
            alt: "Login page",
            caption: "Login page with the public sign-in flow.",
          },
          {
            src: wikiAsset("17-register.png"),
            alt: "Register page",
            caption: "Register flow for self-service account creation.",
          },
          {
            src: wikiAsset("23-forgot-password.png"),
            alt: "Forgot password page",
            caption: "Password reset request form.",
          },
          {
            src: wikiAsset("27-account-security.png"),
            alt: "Account security page",
            caption: "Security page with TOTP, API keys, and app passwords.",
          },
          {
            src: wikiAsset("28-account-billing.png"),
            alt: "Account billing page",
            caption: "User billing page for plans and payment history.",
          },
          {
            src: wikiAsset("29-admin-billing.png"),
            alt: "Admin billing page",
            caption: "Admin billing page for plans, application keys, and payments.",
          },
        ],
      },
      {
        title: "Admin surfaces",
        bullets: [
          "Admins get Status, Settings, System, License, Activity, Billing, and Users.",
          "These pages cover health, panel settings, node management, licensing, payments, and account administration.",
        ],
        images: [
          {
            src: wikiAsset("04-users.png"),
            alt: "Users admin page",
            caption: "User administration with roles and quota controls.",
          },
          {
            src: wikiAsset("05-system-nodes.png"),
            alt: "System nodes page",
            caption: "Node overview with connection status and install actions.",
          },
          {
            src: wikiAsset("06-add-node-modal.png"),
            alt: "Add node modal",
            caption: "Remote node install wizard with SSH-based setup.",
          },
          {
            src: wikiAsset("31-admin-license.png"),
            alt: "Admin license page",
            caption: "License status, limits, and enabled features.",
          },
          {
            src: wikiAsset("26-admin-activity.png"),
            alt: "Admin activity page",
            caption: "Global activity log across users and servers.",
          },
          {
            src: wikiAsset("07-statusline.png"),
            alt: "Status page",
            caption: "Panel, watchdog, and node health overview.",
          },
        ],
      },
      {
        title: "Server workspace",
        paragraphs: [
          "The server detail page is the main operating surface for console, files, SFTP, databases, network, backups, schedules, activity, and game-specific tools.",
          "Header actions expose version changes, software-family changes, reinstall, clone, transfer, and ownership changes.",
        ],
        images: [
          {
            src: wikiAsset("34-server-clone-modal.png"),
            alt: "Clone server modal",
            caption: "Clone flow from the server header actions.",
          },
          {
            src: wikiAsset("35-whitelist-toggle-modal.png"),
            alt: "Whitelist toggle modal",
            caption: "Quick whitelist toggle from header chips.",
          },
          {
            src: wikiAsset("25-server-move-modal.png"),
            alt: "Move server modal",
            caption: "Move a stopped server to another node.",
          },
          {
            src: wikiAsset("08-server-console.png"),
            alt: "Server console",
            caption: "Live console with resource and power controls.",
          },
          {
            src: wikiAsset("09-server-files.png"),
            alt: "Server file manager",
            caption: "Browser-based file manager with edit, upload, and archive actions.",
          },
          {
            src: wikiAsset("10-server-sftp.png"),
            alt: "Server SFTP tab",
            caption: "SFTP connection details for external clients.",
          },
          {
            src: wikiAsset("13-server-databases.png"),
            alt: "Server databases tab",
            caption: "Per-server MySQL database management.",
          },
          {
            src: wikiAsset("24-server-network.png"),
            alt: "Server network tab",
            caption: "Primary and secondary allocation management.",
          },
          {
            src: wikiAsset("11-server-backups.png"),
            alt: "Server backups tab",
            caption: "Create, restore, upload, and download backups.",
          },
          {
            src: wikiAsset("16-server-subusers.png"),
            alt: "Server subusers tab",
            caption: "Invite and permission-manage subusers.",
          },
          {
            src: wikiAsset("15-server-settings.png"),
            alt: "Server settings tab",
            caption: "Server properties, startup settings, and world tools.",
          },
          {
            src: wikiAsset("14-server-players.png"),
            alt: "Server players tab",
            caption: "Online players and recent player visibility.",
          },
          {
            src: wikiAsset("18-server-whitelist.png"),
            alt: "Server whitelist tab",
            caption: "Whitelist manager with quick add/remove controls.",
          },
          {
            src: wikiAsset("19-server-bans.png"),
            alt: "Server bans tab",
            caption: "Ban list and moderation actions.",
          },
          {
            src: wikiAsset("20-server-schedules.png"),
            alt: "Server schedules tab",
            caption: "Scheduled tasks such as backups and restarts.",
          },
          {
            src: wikiAsset("30-server-activity.png"),
            alt: "Server activity tab",
            caption: "Per-server activity and audit stream.",
          },
          {
            src: wikiAsset("22-server-resources.png"),
            alt: "Server resources tab",
            caption: "Disk usage breakdown and resource visibility.",
          },
          {
            src: wikiAsset("32-server-engine.png"),
            alt: "Server engine settings",
            caption: "Engine-specific settings for supported software families.",
          },
          {
            src: wikiAsset("12-server-addons.png"),
            alt: "Server addons tab",
            caption: "Plugin and addon browser and installer.",
          },
          {
            src: wikiAsset("36-addon-version-picker.png"),
            alt: "Addon version picker",
            caption: "Select a specific addon version before install.",
          },
          {
            src: wikiAsset("33-server-modpacks.png"),
            alt: "Server modpacks tab",
            caption: "Modpack browser for compatible server families.",
          },
          {
            src: wikiAsset("38-server-bots.png"),
            alt: "Server bots tab",
            caption: "Optional bot management surface.",
          },
          {
            src: wikiAsset("37-import-server.png"),
            alt: "Import server flow",
            caption: "Import an archive into a new server from the create flow.",
          },
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
    relatedSlugs: ["security", "api-documentation"],
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
    relatedSlugs: ["files-backups", "networking-allocations", "databases", "bots", "mods-plugins-and-modpacks"],
    sections: [
      {
        title: "Lifecycle actions",
        bullets: [
          "Create or import a server from the New server flow.",
          "Clone or reinstall from the server header actions.",
          "Move a stopped server to another node when capacity or location changes.",
          "Use start, stop, restart, and kill for day-to-day power control.",
        ],
        images: [
          {
            src: wikiAsset("03-create-server.png"),
            alt: "Create server page",
            caption: "Create a new server with engine, version, RAM, and port choices.",
          },
          {
            src: wikiAsset("37-import-server.png"),
            alt: "Import server flow",
            caption: "Import an archive into a fresh server from the create flow.",
          },
          {
            src: wikiAsset("34-server-clone-modal.png"),
            alt: "Clone server modal",
            caption: "Clone an existing server from the server header actions.",
          },
          {
            src: wikiAsset("25-server-move-modal.png"),
            alt: "Move server modal",
            caption: "Move a stopped server to another node.",
          },
        ],
      },
      {
        title: "Main tabs",
        paragraphs: [
          "The server detail page combines service tabs, game tabs, and management tabs in one workspace.",
          "This includes console, files, SFTP, databases, network, backups, subusers, settings, players, bans, schedules, activity, logs, resources, and optional bots.",
        ],
        images: [
          {
            src: wikiAsset("08-server-console.png"),
            alt: "Server console tab",
            caption: "The live server workspace starts at the console tab.",
          },
        ],
      },
      {
        title: "World tools and resource packs",
        bullets: [
          "Server Properties → World: reset dimensions or upload a `.zip` world (server must be stopped).",
          "Access/Network: resource pack URL, SHA-1, require-pack, optional upload (`PUBLIC_BASE_URL` must reach players).",
          "World Map tab: seed preview; Paper/Purpur can install BlueMap (TCP 8100).",
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
    relatedSlugs: ["server-management", "sftp", "operations", "databases"],
    sections: [
      {
        title: "File manager",
        bullets: [
          "Browse, edit, upload, download, create folders, and archive selected files in the browser.",
          "Use the web file manager for quick configuration changes and one-off file operations.",
        ],
        images: [
          {
            src: wikiAsset("09-server-files.png"),
            alt: "File manager tab",
            caption: "File manager with browser-based upload, edit, and archive actions.",
          },
        ],
      },
      {
        title: "SFTP",
        paragraphs: [
          "SFTP uses the same server data directory but is better for large or repeated transfers from desktop tools.",
          "You log in with `{panelUsername}.{serverId}` and either the account password or an app password.",
        ],
        images: [
          {
            src: wikiAsset("10-server-sftp.png"),
            alt: "SFTP details tab",
            caption: "SFTP host, port, and username details for external clients.",
          },
        ],
      },
      {
        title: "Backup and restore",
        bullets: [
          "Create manual backups or schedule them later.",
          "Download, upload, restore, and delete backup archives from the panel.",
          "Safety-sensitive flows like reinstall and transfer can create backups before destructive actions.",
        ],
        images: [
          {
            src: wikiAsset("11-server-backups.png"),
            alt: "Backups tab",
            caption: "Backup management for create, upload, restore, and download flows.",
          },
        ],
      },
    ],
  },
  {
    slug: "player-management",
    title: "Player management",
    summary:
      "Manage online players, whitelist entries, bans, moderation actions, and recent player history from the server UI.",
    category: "Using the panel",
    keywords: ["players", "whitelist", "bans", "moderation", "online players", "history"],
    sourcePath: "docs/wiki/player-management.md",
    relatedSlugs: ["server-management", "activity-log", "mods-plugins-and-modpacks"],
    sections: [
      {
        title: "Main player tools",
        bullets: [
          "Online player list and live presence",
          "Whitelist toggle and manager",
          "Kick, ban, pardon, and other moderation actions",
          "Recent moderation and join/leave context",
        ],
        images: [
          {
            src: wikiAsset("14-server-players.png"),
            alt: "Online players tab",
            caption: "Online players and recent player visibility.",
          },
          {
            src: wikiAsset("18-server-whitelist.png"),
            alt: "Whitelist tab",
            caption: "Whitelist management with add and remove controls.",
          },
          {
            src: wikiAsset("19-server-bans.png"),
            alt: "Bans tab",
            caption: "Bans and moderation actions.",
          },
          {
            src: wikiAsset("35-whitelist-toggle-modal.png"),
            alt: "Whitelist quick toggle modal",
            caption: "Quick whitelist toggle from the header chip.",
          },
        ],
      },
      {
        title: "What the data means",
        paragraphs: [
          "Some player presence data is derived from daemon observation and console/event parsing rather than a direct Mojang identity source.",
          "Whitelist state, moderation history, and current presence are related but not the same thing.",
        ],
      },
    ],
  },
  {
    slug: "mods-plugins-and-modpacks",
    title: "Mods, plugins, and modpacks",
    summary:
      "Install compatible addons, browse modpacks, use engine-specific tooling, and manage software-family compatibility.",
    category: "Using the panel",
    keywords: ["mods", "plugins", "modpacks", "modrinth", "engine", "resource pack"],
    sourcePath: "docs/wiki/mods-plugins-and-modpacks.md",
    relatedSlugs: ["server-management", "player-management", "networking-allocations"],
    sections: [
      {
        title: "Supported families",
        bullets: [
          "Vanilla",
          "Paper",
          "Purpur",
          "Fabric",
          "Quilt",
          "Forge",
          "NeoForge",
        ],
      },
      {
        title: "What the panel can do",
        bullets: [
          "Browse compatible addons from supported sources such as Modrinth",
          "Install, update, remove, and sync mods or plugins",
          "Browse and install modpacks for compatible families",
          "Expose engine-specific settings for Paper and Purpur style stacks",
        ],
        images: [
          {
            src: wikiAsset("12-server-addons.png"),
            alt: "Addons tab",
            caption: "Browse and install compatible plugins or mods.",
          },
          {
            src: wikiAsset("36-addon-version-picker.png"),
            alt: "Addon version picker",
            caption: "Choose a specific addon version before install.",
          },
          {
            src: wikiAsset("33-server-modpacks.png"),
            alt: "Modpacks tab",
            caption: "Browse and install modpacks for compatible server families.",
          },
          {
            src: wikiAsset("32-server-engine.png"),
            alt: "Engine settings tab",
            caption: "Engine-specific settings for supported software families.",
          },
        ],
      },
      {
        title: "Compatibility note",
        paragraphs: [
          "Changing software family is a high-impact action because plugin ecosystems and mod ecosystems are not interchangeable.",
          "Large modpack changes are closer to reprovisioning a server than installing a single plugin.",
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
        images: [
          {
            src: wikiAsset("24-server-network.png"),
            alt: "Network allocations tab",
            caption: "Manage primary and extra allocations for a server.",
          },
        ],
      },
      {
        title: "Geyser, BlueMap, Velocity helpers",
        bullets: [
          "Paper/Purpur Network tab: Install Geyser + Floodgate and a UDP companion on the game port.",
          "World Map: Install BlueMap and expose TCP 8100 for the live web map.",
          "Server Properties → Access: Velocity or BungeeCord one-click backend prep (online-mode=false + forwarding). Guartrix does not host the proxy process.",
          "Restart after helper changes so Docker republishes ports.",
        ],
      },
      {
        title: "Node connectivity",
        paragraphs: [
          "Node records also store daemon connection details and optional public/SFTP hostnames.",
          "Remote daemon-only nodes store config in `/var/lib/guartrix/daemon.env` (not `/opt/guartrix/data/daemon.env`).",
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
    slug: "api-documentation",
    title: "API documentation",
    summary:
      "HTTP API docs live in a dedicated API Reference at /api-docs — explorer, examples, Client and Application APIs.",
    category: "Overview",
    keywords: ["api", "rest", "gt_", "gta_", "openapi", "explorer", "client", "application", "billing"],
    sourcePath: "docs/wiki/api-docs-ui.md",
    relatedSlugs: ["overview", "security", "accounts-quotas"],
    sections: [
      {
        title: "Open the API Reference",
        paragraphs: [
          "API documentation is no longer part of this wiki sidebar. Use the dedicated API docs product for overview, conventions, Client API, Application API, examples, and the interactive explorer.",
        ],
        bullets: [
          "Panel path: /api-docs",
          "Interactive Try it: /api-docs/explorer",
          "Old /wiki/api-* URLs redirect automatically.",
        ],
        code: [
          {
            label: "Links",
            language: "text",
            content: "/api-docs\n/api-docs/explorer\n/api-docs/client\n/api-docs/application",
          },
        ],
      },
    ],
  },
  {
    slug: "panel-settings",
    title: "Panel settings",
    summary:
      "Configure public URLs, registration, SMTP, security flags, Redis visibility, and alert sinks from Admin -> Settings.",
    category: "Operations",
    keywords: ["settings", "smtp", "registration", "redis", "alerts", "public host"],
    sourcePath: "docs/wiki/panel-settings.md",
    relatedSlugs: ["security", "operations", "notifications-alerts"],
    sections: [
      {
        title: "What it controls",
        bullets: [
          "General settings like public host, base URL, registration, and default quotas.",
          "Mail settings including SMTP and test mail.",
          "Security settings such as HTTPS flags and 2FA-required roles.",
          "Alert delivery settings such as activity webhook and alert email.",
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
    slug: "schedules",
    title: "Schedules",
    summary:
      "Run timed chains like backup, wait, restart, and command through the server schedule system.",
    category: "Using the panel",
    keywords: ["schedules", "tasks", "backup", "restart", "automation"],
    sourcePath: "docs/wiki/schedules.md",
    relatedSlugs: ["files-backups", "api-documentation", "operations"],
    sections: [
      {
        title: "What schedules do",
        paragraphs: [
          "Schedules let you automate server maintenance as ordered step chains rather than only a single recurring action.",
          "Typical sequences include backup, wait, restart, and command execution.",
        ],
      },
      {
        title: "API and automation",
        code: [
          {
            label: "Schedule endpoints",
            language: "http",
            content:
              "GET  /api/servers/:id/tasks\nPOST /api/servers/:id/tasks\nPOST /api/servers/:id/tasks/:taskId/run",
          },
        ],
      },
    ],
  },
  {
    slug: "node-transfer",
    title: "Move between nodes",
    summary:
      "Transfer a stopped server from one node to another, including data, allocations, and database handling.",
    category: "Using the panel",
    keywords: ["transfer", "move", "nodes", "allocations", "database", "stopped server"],
    sourcePath: "docs/wiki/node-transfer.md",
    relatedSlugs: ["server-management", "networking-allocations", "install-nodes"],
    sections: [
      {
        title: "Transfer flow",
        bullets: [
          "The server must be stopped before transfer starts.",
          "The panel streams an archive from source daemon to destination daemon.",
          "Allocations, firewall state, and optional DNS-related behavior are rebound on the destination.",
          "MySQL data is dumped and restored as part of the move flow when needed.",
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
          "Console and event pub/sub across API replicas",
        ],
      },
    ],
  },
  {
    slug: "development",
    title: "Development",
    summary:
      "Run the monorepo locally, understand where features live, and use the build, test, and OpenAPI maintenance workflows.",
    category: "Reference",
    keywords: ["development", "dev", "vite", "fastify", "tests", "openapi"],
    sourcePath: "docs/wiki/development.md",
    relatedSlugs: ["api-surface-map", "build-release-internals", "daemon-api"],
    sections: [
      {
        title: "Local workflow",
        code: [
          {
            label: "Run locally",
            language: "bash",
            content:
              "cp .env.example .env\nnpm install\nnpm run db:generate && bash scripts/db-migrate.sh\n\nnpm run dev:api\nnpm run dev:web\nnpm run dev:daemon",
          },
        ],
      },
      {
        title: "Important paths",
        bullets: [
          "`apps/web/src/pages` for route-level UI pages",
          "`apps/api/src/routes` plus domain folders for backend behavior",
          "`apps/daemon/src` as the daemon entrypoint",
          "`packages/node-agent` and `packages/shared` for shared runtime and contracts",
        ],
      },
    ],
  },
  {
    slug: "daemon-api",
    title: "Daemon API",
    summary:
      "See how the node-local daemon handles files, MySQL, firewall actions, WebSockets, health, and authenticated control traffic.",
    category: "Reference",
    keywords: ["daemon", "api", "health", "ready", "files", "mysql", "firewall", "websocket"],
    sourcePath: "docs/wiki/daemon-api.md",
    relatedSlugs: ["install-nodes", "node-agent-internals", "auth-session-internals"],
    sections: [
      {
        title: "Responsibilities",
        bullets: [
          "Container lifecycle and commands",
          "Console and event streams",
          "File access and archives",
          "Node-local MySQL operations",
          "Firewall open/close actions",
          "SFTP hosting",
          "Resource reporting and license gating",
        ],
      },
      {
        title: "Health and trust boundaries",
        bullets: [
          "`/health` and `/ready` expose daemon status and Docker readiness.",
          "The broader control surface is protected by daemon auth rather than being public.",
        ],
      },
    ],
  },
  {
    slug: "node-agent-internals",
    title: "Node-agent internals",
    summary:
      "Understand the host runtime behind the daemon: Docker lifecycle, quotas, jailed files, SFTP, firewall, and player history.",
    category: "Reference",
    keywords: ["node-agent", "docker", "sftp", "jail", "quota", "mysql", "firewall"],
    sourcePath: "docs/wiki/node-agent-internals.md",
    relatedSlugs: ["daemon-api", "files-backups", "networking-allocations"],
    sections: [
      {
        title: "Subsystems",
        bullets: [
          "Runtime layout and config",
          "Process and container lifecycle",
          "Resource and quota enforcement",
          "Files, archive safety, and SFTP jail",
          "MySQL helper and firewall integration",
          "Player history",
        ],
      },
    ],
  },
  {
    slug: "shared-contracts",
    title: "Shared contracts",
    summary:
      "Explore the shared types, permissions, activity taxonomy, daemon JWTs, and license verification helpers used across services.",
    category: "Reference",
    keywords: ["shared", "contracts", "permissions", "activity", "daemon jwt", "license ticket"],
    sourcePath: "docs/wiki/shared-contracts.md",
    relatedSlugs: ["api-surface-map", "auth-session-internals", "license-flow"],
    sections: [
      {
        title: "What is shared",
        bullets: [
          "Server, node, file/stat, database, schedule, and auth payload shapes",
          "Permission names for subusers and API keys",
          "Activity categories and action keys",
          "Daemon JWT verification helpers",
          "License claim and ticket verification helpers",
        ],
      },
    ],
  },
  {
    slug: "auth-session-internals",
    title: "Auth and session internals",
    summary:
      "See how sessions, TOTP, invites, reset tokens, API keys, app passwords, and daemon auth fit together.",
    category: "Reference",
    keywords: ["auth", "sessions", "2fa", "invites", "app passwords", "daemon jwt"],
    sourcePath: "docs/wiki/auth-and-session-internals.md",
    relatedSlugs: ["accounts-quotas", "api-documentation"],
    sections: [
      {
        title: "Auth surfaces",
        bullets: [
          "Session cookie for the browser UI",
          "Personal `gt_` keys for end-user automation",
          "App passwords for SFTP and desktop clients",
          "Machine `gta_` keys for external admin automation",
          "Short-lived daemon JWTs for panel-to-node traffic",
        ],
      },
    ],
  },
  {
    slug: "billing-internals",
    title: "Billing internals",
    summary:
      "Understand plan templates, Mollie payment state, quota application, subscriptions, and machine-facing provisioning flows.",
    category: "Reference",
    keywords: ["billing", "plans", "mollie", "subscriptions", "payments", "quotas"],
    sourcePath: "docs/wiki/billing-internals.md",
    relatedSlugs: ["api-documentation", "accounts-quotas", "licensing"],
    sections: [
      {
        title: "Core domains",
        bullets: [
          "Plan templates",
          "Payment rows and statuses",
          "Quota application",
          "Recurring subscription lifecycle",
          "Machine-driven user and server provisioning",
        ],
      },
    ],
  },
  {
    slug: "license-flow",
    title: "License flow internals",
    summary:
      "Follow the signed validate flow from panel usage reporting to daemon ticket verification and free-tier fallback.",
    category: "Reference",
    keywords: ["license flow", "validate", "ticket", "free tier", "claims", "public key"],
    sourcePath: "docs/wiki/license-flow-internals.md",
    relatedSlugs: ["licensing", "daemon-api", "shared-contracts"],
    sections: [
      {
        title: "Flow overview",
        bullets: [
          "The panel reports usage to the public license API.",
          "The API returns signed claims.",
          "The panel verifies those claims and pushes daemon tickets.",
          "Daemons verify the ticket locally and gate starts accordingly.",
        ],
      },
    ],
  },
  {
    slug: "api-surface-map",
    title: "API and surface map",
    summary:
      "Find where Guartrix features live across UI pages, API route families, daemon routes, shared packages, scripts, and data-model domains.",
    category: "Reference",
    keywords: ["surface map", "routes", "ui pages", "daemon routes", "scripts", "prisma"],
    sourcePath: "docs/wiki/api-surface-map.md",
    relatedSlugs: ["daemon-api", "shared-contracts", "development"],
    sections: [
      {
        title: "What it maps",
        bullets: [
          "Web UI pages",
          "API route families",
          "Daemon route families",
          "Node-agent and shared package subsystems",
          "Operational script families",
          "Prisma model domains",
        ],
      },
      {
        title: "Route families you can look up",
        code: [
          {
            label: "Examples of route groups",
            language: "text",
            content:
              "auth, two-factor, invites, api-keys, app-passwords,\nservers, servers-dashboard, servers-power, servers-settings,\nfiles, backups, databases, sftp-auth,\nnodes, allocations, status, activity,\nbilling, application, license, bots",
          },
        ],
      },
    ],
  },
  {
    slug: "build-release-internals",
    title: "Build and release internals",
    summary:
      "See how Guartrix creates build trees, release tarballs, customer packages, and downloadable bundles.",
    category: "Reference",
    keywords: ["build", "release", "build-out", "staging", "tarball", "download bundle"],
    sourcePath: "docs/wiki/build-and-release-internals.md",
    relatedSlugs: ["operations", "prod-web-downloads", "development"],
    sections: [
      {
        title: "Main outputs",
        bullets: [
          "Normal development `dist/` builds",
          "Runnable `build/` trees",
          "Release archives and downloadable package bundles",
        ],
      },
      {
        title: "Main scripts",
        bullets: [
          "`scripts/build-out.sh`",
          "`scripts/esbuild-release.mjs`",
          "`scripts/lib-stage-release.sh`",
          "`scripts/package-release.sh`",
          "download-bundle packaging flow",
        ],
      },
    ],
  },
  {
    slug: "prod-web-downloads",
    title: "Prod-web and downloads",
    summary:
      "Understand the production edge server, static serving, reverse proxy, TLS handling, and optional `/download` integration.",
    category: "Reference",
    keywords: ["prod-web", "download", "reverse proxy", "tls", "static", "edge"],
    sourcePath: "docs/wiki/prod-web-and-downloads.md",
    relatedSlugs: ["build-release-internals", "operations", "install-panel"],
    sections: [
      {
        title: "What prod-web does",
        bullets: [
          "Serve the built web UI",
          "Proxy `/api` and `/ws`",
          "Handle HTTP/HTTPS behavior and TLS cert loading",
          "Optionally expose the password-protected `/download` surface on the operator host",
        ],
      },
    ],
  },
  {
    slug: "notifications-alerts",
    title: "Notifications and alerts",
    summary:
      "See how Guartrix uses email, webhooks, Web Push, and in-panel warnings for operational and account notifications.",
    category: "Reference",
    keywords: ["notifications", "alerts", "webhook", "email", "push", "activity"],
    sourcePath: "docs/wiki/notifications-and-alerts.md",
    relatedSlugs: ["activity-log", "panel-settings", "security"],
    sections: [
      {
        title: "Notification channels",
        bullets: [
          "Email for verification, reset, invites, and optional alerts",
          "Activity webhook for critical events and watchdog incidents",
          "Per-server owner Discord webhook / Discord status message (Server Properties → General)",
          "Web Push for account-level browser/device notifications",
          "In-panel banners for license, restart-required, and validation warnings",
        ],
      },
      {
        title: "Operational relevance",
        paragraphs: [
          "Alert delivery settings live partly in panel settings and partly in environment-backed runtime behavior.",
          "Webhook and email notifications help operators notice crashes, node issues, license failures, and other critical platform events quickly.",
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
          "On systemd installs: `systemctl restart guartrix-api guartrix-web guartrix-daemon`.",
          "On operator checkouts: build and use `bash scripts/start.sh` (preflight, processes, watchdog).",
          "Do not mix systemd restarts with the start.sh watchdog on the same host.",
        ],
      },
      {
        title: "Watchdog and health",
        bullets: [
          "The watchdog checks API and daemon liveness/readiness.",
          "It restarts unhealthy panel processes without intentionally killing Minecraft containers.",
          "Webhook alerts can fire when restart loops or critical backoff events happen.",
          "Admin → Status (`/statusline`) shows web, API, Redis, and per-node health.",
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
    article.markdown ?? "",
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
