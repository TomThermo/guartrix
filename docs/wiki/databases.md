# Game databases (MySQL)

Each Minecraft server can get one or more **MySQL databases on its node**, managed from **Server → Databases**. Credentials are created on the node MySQL and stored sealed in the panel.

## How it works

1. Owner/admin opens **Databases** and creates a DB (you pick a suffix; the panel prefixes `s#####_`).
2. The API asks the **daemon** on that node to create the database + user (`packages/node-agent` MySQL helper).
3. Connection host for plugins inside the game container is usually Docker DNS name **`guartrix-mysql`** (override with `MYSQL_PUBLIC_HOST` on the daemon).
4. Quotas: owner `maxDatabases` (admins unlimited / `null`). Defaults for new users come from `DEFAULT_MAX_DATABASES` (often `0` until an admin raises the quota).

![Databases](assets/13-server-databases.png)

## Host layout

| Scenario | Where MySQL lives |
|----------|-------------------|
| **Full panel + Docker MySQL** (installer default) | One container `guartrix-mysql` on `127.0.0.1:3306` — **panel DB and game DBs share this volume** (`$INSTALL_DIR/data/mysql`). Wiping the volume deletes both. |
| **Panel external MySQL on localhost:3306** | Installer puts game MySQL Docker on host port **`3307`** (`MYSQL_PORT` in the daemon env file). |
| **Remote node** | Daemon starts/reuses `guartrix-mysql` on that node; panel DB stays on the panel host. |

Root password and port live in the **daemon env file** (local `data/daemon.env` or remote `/var/lib/guartrix/daemon.env`). See [Install the panel](install-panel.md#panel-mysql) and [Environment variables](env-reference.md).

## Connecting from a plugin

Typical JDBC/plugin settings (from inside the game container):

| Field | Value |
|-------|--------|
| Host | `guartrix-mysql` (or `MYSQL_PUBLIC_HOST`) |
| Port | `3306` (container port; host publish may be 3306 or 3307) |
| Database / user / password | Shown once in the panel (copy carefully; passwords are sealed at rest) |

Remote MySQL clients on the public internet are **not** exposed by default (bind `127.0.0.1`). Use SSH tunnel or a deliberate publish if you need external tools.

## Quotas and permissions

- Create/delete requires database permission on the server (owner / subuser grant).
- Hitting the owner’s `maxDatabases` blocks new creates until an admin raises the quota (**Users** or Admin settings defaults).

## Related

- [Accounts & quotas](accounts-and-quotas.md)
- [Files and backups](files-and-backups.md) — DB dumps are separate from world backups; node transfer dump/restores game DBs
- [Node-agent internals](node-agent-internals.md)
- [Security](security.md) — sealed passwords, `SESSION_SECRET` rotation
