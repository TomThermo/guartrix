# Install nodes (remote daemons)

A **node** is a VPS running the Guartrix daemon. Minecraft servers are scheduled onto nodes. The panel reaches each node at `http(s)://HOST:8081` with a **short-lived JWT** signed using the per-node shared secret (`DAEMON_TOKEN`).

## Recommended: Admin UI wizard

1. Sign in as **admin** → **System**.
2. Click **Add node**.
3. Read the short howto, then enter:
   - **Name** (e.g. `node-2`)
   - **Host / FQDN** — IP or hostname the **panel** uses to reach this VPS
   - Optional **Location / region** label (shown in the create-server node picker)
   - Scheme (`http` on LAN/VPS is typical) and daemon port (`8081`)
4. On the install step, enter SSH user + password **or** private key.
5. Watch the **live log** from the remote server.
6. When finished, click **Test connection** until status is **ONLINE**.
7. Create a Minecraft server and select that node (admins only choose node placement).

SSH credentials are used once and **not stored**.

![System — nodes](assets/05-system-nodes.png)

![Add node wizard](assets/06-add-node-modal.png)

For an existing remote node, use **Install daemon** on the node card to reopen the wizard.

See also the [Panel guide](panel-guide.md) for the rest of the admin UI.

## Manual install

On the remote Ubuntu VPS (as root or via sudo) — download, then run:

```bash
curl -Lo /tmp/guartrix-daemon.sh https://YOUR_PANEL/install-daemon.sh
sudo bash /tmp/guartrix-daemon.sh \
  --token NODE_TOKEN \
  --node-id NODE_ID \
  --fqdn NODE_PUBLIC_IP \
  --port 8081 \
  --panel https://YOUR_PANEL \
  --repo https://github.com/TomThermo/guartrix.git
```

`NODE_TOKEN`, `NODE_ID`, and the exact command are shown in the panel install modal.

Open firewall ports on the node:

| Port | Purpose |
|------|---------|
| `8081/tcp` | Daemon API (panel → node) |
| `2022/tcp` | SFTP |
| game ports | e.g. `25565/tcp` (and whatever you assign) |

The installer can auto-open ports when `MANAGE_FIREWALL=true`.

## Docker access (least privilege)

The daemon talks to Docker via `sudo -n docker` by default (passwordless sudo for the
install user). That is root-equivalent on the host if the daemon process is compromised.

Hardening options (pick one):

1. **Docker group** — add the daemon user to `docker`, drop the sudoers docker rule, and
   set `DOCKER_BIN=docker` (no sudo) in `data/daemon.env`. Understand that group membership
   is still effectively root via the Docker socket.
2. **Rootless Docker** — run Engine as the daemon user (best isolation; some
   networking / publish modes differ). Concrete outline:
   - Install rootless prerequisites (`uidmap`, `dbus-user-session`, etc.) per
     [Docker rootless docs](https://docs.docker.com/engine/security/rootless/).
   - As the **daemon OS user** (not root), run:
     `dockerd-rootless-setuptool.sh install`
     (starts a user-mode `dockerd` and systemd user unit).
   - Point clients at the user socket, e.g.
     `DOCKER_HOST=unix:///run/user/UID/docker.sock`
     (`UID` = that user’s numeric id; also exported by the rootless helper).
   - In `data/daemon.env` set `DOCKER_BIN=docker` (no `sudo`) and ensure the
     daemon process inherits `DOCKER_HOST` (systemd `Environment=` / `EnvironmentFile=`
     for the Guartrix daemon unit, or a wrapper).
   - Confirm with `docker info` / daemon `/ready` as that user.
   - **SELinux:** volume mounts often need `:z` / `:Z` (or equivalent context
     relabel) so rootless containers can write host bind mounts; without it you
     get “permission denied” on world files. Check audit logs if mounts fail.
3. **Keep sudo** — tighten sudoers to only the exact `docker` binary + subcommands the
   node-agent uses (not a full shell).

Checklist still expects `/health` and `/ready` (Docker reachable) after changes.

Shared plugin/world dirs for **extra host mounts** should live under `/var/lib/guartrix/shared` or `/opt/guartrix/shared` on the node (or set panel `EXTRA_MOUNTS_ALLOW_PREFIX`).

## Checklist

- [ ] Panel can HTTP reach `HOST:8081/health` and `/ready`
- [ ] Node shows **ONLINE** after Test connection
- [ ] SFTP host resolves (optional Cloudflare DNS for `sftpHostname`)
- [ ] New servers land on the intended node

## Scaling note

Many nodes + one panel is the supported model. See [Scaling](scaling.md).
