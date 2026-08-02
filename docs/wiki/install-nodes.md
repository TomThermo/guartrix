# Install nodes (remote daemons)

A **node** is a VPS running the Guartrix daemon. Minecraft servers are scheduled onto nodes. The panel reaches each node at `http(s)://HOST:8081` with a **short-lived JWT** signed using the per-node shared secret (`DAEMON_TOKEN`).

## Recommended: Admin UI wizard

1. Sign in as **admin** → **System**.
2. Click **Add node**.
3. Read the short howto, then enter:
   - **Name** (e.g. `node-2`)
   - **Host / FQDN** — IP or hostname the **panel** uses to reach this VPS
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

## Manual curl install

On the remote Ubuntu VPS (as root or via sudo):

```bash
curl -fsSL https://YOUR_PANEL/install-daemon.sh | sudo bash -s -- \
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

## Checklist

- [ ] Panel can HTTP reach `HOST:8081/health`
- [ ] Node shows **ONLINE** after Test connection
- [ ] SFTP host resolves (optional Cloudflare DNS for `sftpHostname`)
- [ ] New servers land on the intended node

## Scaling note

Many nodes + one panel is the supported model. See [Scaling](scaling.md).
