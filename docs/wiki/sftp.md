# SFTP

Each node runs an embedded SFTP server (default port **2022**). Use **SFTP** (SSH File Transfer Protocol) — not plain FTP or FTPS.

## In the panel

Open a server → **SFTP** in the sidebar. Host, port, and username are copy-ready.
Password is your **panel password** or an **SFTP app password** from
**Security → App passwords** (`gtap_…`).

![SFTP credentials in the panel](assets/10-server-sftp.png)

For quick in-browser edits, use **File Manager** instead:

![File Manager](assets/09-server-files.png)

## Connection

| Field | Value |
|-------|--------|
| Host | Node hostname (e.g. `node1.guartrix.com`) or public IP |
| Port | `2022` (or `SFTP_PORT`) |
| Username | `{panelUsername}.{serverId}` |
| Password | Panel password **or** SFTP app password (`gtap_…` from Security) |
| Protocol | **SFTP** |

### FileZilla example

- Protocol: **SFTP – SSH File Transfer Protocol**
- Host: `node1.guartrix.com` (no `sftp://` prefix in some clients)
- Port: `2022`
- Logon type: Normal
- User: `yourname.SERVERID`

## Permissions

SFTP requires `file.sftp`. Mutating ops map to panel file permissions:

| SFTP action | Permission |
|-------------|------------|
| Upload new file | `file.upload` |
| Edit / truncate existing | `file.update` |
| Mkdir | `file.create` or `file.upload` |
| Rename | `file.update` |
| Delete / rmdir | `file.delete` |

Owners and admins get full access. The daemon asks the panel (`POST /api/internal/sftp-auth`) with the node bearer token on each login.

## Safety

- Path jail under the server data directory; `..` and escaping symlinks are rejected.
- Opens use `O_NOFOLLOW` where available.
- Panel control files matching `guartrix-*.json` are hidden and blocked over SFTP.
- READ chunks are capped (256 KiB) to limit memory spikes.

## Related

- [Panel guide](panel-guide.md)
- [Install nodes](install-nodes.md)
