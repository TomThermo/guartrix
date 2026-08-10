import type { WikiArticle } from "../wiki-types";

export const usingPanelArticles: WikiArticle[] = [
  {
    slug: "sftp",
    title: "SFTP",
    summary: "Per-node SFTP on port 2022 — username format, permissions, and FileZilla notes.",
    category: "Using the panel",
    keywords: ["sftp", "ftp", "files", "2022", "filezilla"],
    sourcePath: "docs/wiki/sftp.md",
    relatedSlugs: ["files-backups", "accounts-quotas", "security"],
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
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
    sections: [],
  },
];
