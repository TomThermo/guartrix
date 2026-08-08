import type { WikiArticle } from "../wiki-types";
import { wikiAsset } from "../wiki-assets";

export const usingPanelArticles: WikiArticle[] = [
  {
    slug: "sftp",
    title: "SFTP",
    summary: "Per-node SFTP on port 2022 — username format, permissions, and FileZilla notes.",
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
          "Account menu: Profile (name, email with live availability check, password change with 2FA step-up, phone, address check), Appearance (theme + 12 palettes), Security (TOTP), Access (API keys + SFTP app passwords), Notifications, Privacy, Billing.",
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
            caption: "Security tabs for TOTP, Access keys/passwords, and more.",
          },
          {
            src: wikiAsset("28-account-billing.png"),
            alt: "Account billing page",
            caption: "User billing page for plans and payment history.",
          },
          {
            src: wikiAsset("29-admin-billing.png"),
            alt: "Admin billing page",
            caption: "Admin billing for Mollie plans and payments (API keys under Config).",
          },
        ],
      },
      {
        title: "Admin surfaces",
        bullets: [
          "Admins open a dedicated Admin area with a grouped sidebar: Overview (Status, Go-live, Activity); Fleet (Servers, Nodes, Users); Config (Settings, Security, API keys); Commerce (Billing, License).",
          "Admin → Servers edits name, owner, resources, suspend, and backup retention for every server.",
          "Settings tabs open with General first, then Mail, Alerts, Backup defaults, Misc, and Go-live (also linked from Overview). Deep-link with ?tab=. HTTPS, proxies, 2FA roles, Turnstile, and Redis are under Admin → Security.",
          "Sidebar badges show live counts next to Servers, Nodes, and Users.",
        ],
        images: [
          {
            src: wikiAsset("04-users.png"),
            alt: "Users admin page",
            caption: "User administration — create via modal; quotas and other actions under ⋮.",
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
            caption: "Live console with sidebar power controls (also mirrored in the header).",
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
      "Understand roles, registration, verification, password reset, TOTP, profile contact fields, subusers, API keys, account export, and quota-based access.",
    category: "Using the panel",
    keywords: ["accounts", "roles", "quotas", "2fa", "subusers", "api keys", "profile", "password"],
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
        title: "Profile and password",
        bullets: [
          "Account → Profile: full name, email (live availability + re-verify on change), password change (confirm twice; authenticator code when 2FA is on).",
          "Mobile with country flag + dial code, and postal address with map address-check (OpenStreetMap).",
          "Session APIs: GET/PATCH /api/account/profile, GET /api/account/email-available, POST /api/account/password.",
        ],
      },
      {
        title: "Security and delegation",
        bullets: [
          "TOTP can be optional or required for selected roles.",
          "Subusers receive fine-grained per-server permissions.",
          "Invite accept requires a matching verified email (`emailVerified`).",
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
    relatedSlugs: [
      "files-backups",
      "networking-allocations",
      "databases",
      "mods-plugins-and-modpacks",
    ],
    sections: [
      {
        title: "Lifecycle actions",
        bullets: [
          "Create or import a server from the New server flow (includes backup retention).",
          "Clone or reinstall from the server header actions.",
          "Move a stopped server to another node when capacity or location changes.",
          "Use start, stop, restart, and kill for day-to-day power control — also available in the server header from any tab.",
          "Console resource charts stay collapsed by default; expand when you need history.",
          "Click the server icon in the header (settings.update) to change the Minecraft multiplayer list icon.",
        ],
        images: [
          {
            src: wikiAsset("03-create-server.png"),
            alt: "Create server page",
            caption: "Create a new server with engine, version, RAM, port, and backup retention.",
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
          "The server detail page groups tabs as Control, Files & data, Network (Ports), Game, Players, and Ops (Schedules, Subusers, Audit log, Server logs).",
          "This includes console, files, SFTP, databases, network, backups, subusers, settings, players, bans, schedules, activity, logs, and resources.",
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
          "The Backups tab shows the keep limit read-only (set at create time or in Admin → Servers).",
          "Create manual backups or enable the automatic schedule on the same tab.",
          "Download, upload, restore, and delete backup archives from the panel.",
          "Panel default for new servers: Admin → Settings → Backup.",
          "Safety-sensitive flows like reinstall and transfer can create backups before destructive actions.",
        ],
        images: [
          {
            src: wikiAsset("11-server-backups.png"),
            alt: "Backups tab",
            caption: "Create/upload/restore backups; keep limit is read-only on this tab.",
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
        bullets: ["Vanilla", "Paper", "Purpur", "Fabric", "Quilt", "Forge", "NeoForge"],
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
      "Transfer a stopped server peer node→node (files + MySQL). Panel disk staging is opt-in only.",
    category: "Using the panel",
    keywords: [
      "transfer",
      "move",
      "nodes",
      "allocations",
      "database",
      "stopped server",
      "peer",
      "staging",
    ],
    sourcePath: "docs/wiki/node-transfer.md",
    relatedSlugs: ["server-management", "networking-allocations", "install-nodes", "sla-ops"],
    sections: [
      {
        title: "Transfer flow",
        bullets: [
          "The server must be stopped before transfer starts.",
          "Destination pulls the world archive from the source daemon (peer deploy-from).",
          "MySQL prefers peer restore-from; panel SQL temp only if TRANSFER_ALLOW_PANEL_STAGING=1.",
          "Allocations, firewall state, and optional DNS-related behavior are rebound on the destination.",
        ],
      },
      {
        title: "Panel staging",
        paragraphs: [
          "From 1.2, panel tmpdisk staging defaults off so large worlds cannot cliff panel disk/IO. Enable TRANSFER_ALLOW_PANEL_STAGING=1 only when nodes cannot reach each other.",
        ],
      },
    ],
  },
];
