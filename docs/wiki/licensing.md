# Licensing

Customer panels validate a **license key** against Guartrix’s public license API.

Default:

`LICENSE_SERVER_URL=https://license.guartrix.com`

Set the key in `.env` as `LICENSE_KEY`, or under **Admin → License**. You can also change the license API URL there if Guartrix gives you a different endpoint.

## What the panel does

| Piece | Role |
|-------|------|
| **Panel API** | Calls `POST /v1/validate` on a schedule; verifies **Ed25519-signed** responses |
| **Admin → License** | Status, license key, optional server URL override, revalidate |
| **Game servers** | On expiry / revoke the panel **stops Minecraft servers** and blocks start/restart |

The **website/panel UI stays online** when a license expires. End users are not shown a license banner; start/restart shows a console message to contact an administrator. Admins see a banner and use **Admin → License**.

## Env (panel)

| Variable | Purpose |
|----------|---------|
| `LICENSE_SERVER_URL` | License API base URL (default `https://license.guartrix.com`) |
| `LICENSE_KEY` | Your `GTRX-…` key |
| `LICENSE_INSTALL_ID` | Optional stable install id (else auto-file under `data/`) |
| `LICENSE_VERIFY_PUBLIC_KEY` | Optional PEM; else `data/licenses/signing-public.pem` shipped with the panel |
| `LICENSE_ALLOW_UNSIGNED` | `1` = accept unsigned validate JSON (**insecure**, emergency only) |
| `LICENSE_UNREACHABLE_GRACE_MS` | Soft-valid window if the API is unreachable (default 24h) |
| `LICENSE_VALIDATE_INTERVAL_MS` | How often to re-check (default 10 minutes) |

See [Environment variables](env-reference.md).

## Security note

This is a **commercial control plane**, not DRM. Prefer [release builds](release-builds.md) (no sources in the customer tarball). A determined attacker with a patched panel can still skip checks.

## Related

- [Install the panel](install-panel.md)
- [Operations](operations.md)
- [Release builds](release-builds.md)
