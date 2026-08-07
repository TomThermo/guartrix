# SLA contract template (non-legal)

Operator-facing **starting point** for a managed Guartrix hosting SLA.
This is **not** legal advice — have counsel adapt it to your jurisdiction.

Record operational drills in **Admin → Settings → Go-live**. Engineering controls:
`REQUIRE_REDIS_HA`, BullMQ, peer-only transfers — see [sla-ops.md](sla-ops.md).

## Service

| Item | Template |
|------|----------|
| Covered service | Guartrix panel API + web UI + licensed daemons under the operator’s control |
| Excluded | Customer Minecraft worlds/plugins, upstream Mojang/Java outages, customer misconfiguration, force majeure |
| Measurement | Successful `GET /api/ready` from the operator’s probe (or Prometheus blackbox) |

## Availability

| Item | Template |
|------|----------|
| Target | 99.9% monthly panel control-plane uptime |
| Maintenance window | Announce ≥24h ahead; excluded from downtime when announced |
| Credit | Example: 5% monthly fee per full hour of unexcused downtime, capped at 50% |

## Recovery objectives

| Item | Template |
|------|----------|
| RTO (panel DB restore) | 1 hour |
| RPO (panel MySQL) | 24 hours (nightly backup) |
| Game node loss | Rebuild from backups / peer transfer; world RPO depends on customer backup schedule |

## Support

| Severity | Response | Update cadence |
|----------|----------|----------------|
| Sev-1 — panel down / data loss risk | 1 hour | every 1 hour |
| Sev-2 — degraded (single node / Redis failover) | 4 hours | every 4 hours |
| Sev-3 — non-urgent | 1 business day | as needed |

## Customer responsibilities

- Keep SMTP / DNS / billing keys accurate when self-managed.
- Do not disable `REQUIRE_REDIS_HA` / peer-only transfers on managed estates without change control.
- Maintain game-world backup schedules appropriate to their RPO.

## Operator responsibilities

- Run restore + secret-rotation + capacity drills; attest in Go-live.
- Keep Redis HA, BullMQ, alerts, and HTTPS/session secure.
- Commission an external pentest on a defined cadence ([pentest-scope.md](pentest-scope.md)).

## Related

- [SLA ops](sla-ops.md)
- [Security](security.md)
- [Scaling](scaling.md)
