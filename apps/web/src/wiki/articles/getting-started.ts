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
      {
        title: "Preseed checklist (skip curl|sh)",
        paragraphs: [
          "On production nodes, install Docker Engine and Node.js 22 from vendor packages before running install-daemon.sh or the Add-node wizard.",
          "When docker and node (≥22) are already on PATH, the installer prints a tip and skips unpinned curl|sh convenience scripts.",
        ],
        bullets: [
          "Prefer a tagged Guartrix release for --repo / --branch.",
          "Keep the daemon firewall panel-IP only via PANEL_URL + ufw.",
          "If you must use convenience scripts once, pin versions and verify checksums — do not re-run curl|sh on every deploy.",
        ],
      },
    ],
  },
];
