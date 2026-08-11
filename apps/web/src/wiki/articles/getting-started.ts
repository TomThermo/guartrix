import type { WikiArticle } from "../wiki-types";

export const gettingStartedArticles: WikiArticle[] = [
  {
    slug: "install-panel",
    title: "Install the panel",
    summary:
      "Set up Guartrix on an Ubuntu VPS with Docker, Node.js, MySQL, optional Redis, and first-boot guidance.",
    category: "Getting started",
    keywords: ["install", "ubuntu", "vps", "mysql", "redis", "https", "setup"],
    sourcePath: "docs/wiki/install-panel.md",
    relatedSlugs: ["install-nodes", "operations", "security"],
    sections: [],
  },
  {
    slug: "install-nodes",
    title: "Install nodes",
    summary:
      "Add remote daemon nodes with the admin wizard or a manual install command, then connect them to the panel securely. Per-node storage pools (local or NFS) can be mounted from the panel.",
    category: "Getting started",
    keywords: ["nodes", "daemon", "remote install", "ssh", "sftp", "firewall", "storage", "nfs", "mount"],
    sourcePath: "docs/wiki/install-nodes.md",
    relatedSlugs: ["install-panel", "networking-allocations", "daemon-api"],
    sections: [],
  },
];
