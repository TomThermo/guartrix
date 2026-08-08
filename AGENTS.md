# Agent notes (Guartrix)

## Cursor Cloud specific instructions

This repo ships [`.cursor/environment.json`](.cursor/environment.json) so Cloud Agents boot with Node 22, Docker (`fuse-overlayfs`), and panel MySQL via [`docker-compose.dev.yml`](docker-compose.dev.yml).

### After boot

- MySQL: `mysql://guartrix:guartrix@127.0.0.1:3306/guartrix_panel` (compose defaults).
- Prefer `npm test`, `npm run lint`, and `bash scripts/db-migrate.sh` for verification.
- Full operator release (`bash scripts/build-out.sh` → package downloads → `bash build/start.sh`) needs a live operator checkout with real `.env` / license PEM — **not** this cloud VM and **not** production `guartrix.com` unless you are on that host.
- Do **not** recreate `apps/license-server` here; issuer stays private outside this repo.
- Do **not** commit `.env`, `data/daemon.env`, private PEMs, `build/`, or `dist-download/`.
- Do **not** run or “finish” an **external pentest** or a **legal/contractual SLA** in this repo or cloud session — those belong to operators/customers who deploy Guartrix. Agents only keep code hardening + wiki templates / Go-live attestation UI (see `.cursor/rules/no-pentest-sla-agent-work.mdc`).

### Secrets (dashboard)

Add via Cursor Cloud Agents → Secrets if needed for e2e against a staging panel: SMTP, Discord webhooks, license server URL. Dev MySQL passwords above are fine for the compose stack only.
