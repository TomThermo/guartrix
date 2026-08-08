# SLA drill log (example)

Copy this pattern into your private ops notes (do **not** commit production secrets).

## 2026-08-07 — cloud staging estate

| Drill | Result |
|-------|--------|
| `REQUIRE_REDIS_HA=1` boot | Pass — Redis + BullMQ + redis stores |
| Panel DB backup | Pass — `data/backups/panel/guartrix_panel_*.sql.gz` |
| Restore to staging MySQL | Pass — `guartrix_panel_staging` |
| Secret rotation (`SESSION_SECRET`, `METRICS_TOKEN`) | Pass — services healthy after restart |
| `bash scripts/scale-smoke.sh` | Pass |
| Go-live attestations | Restore / capacity / secret rotation / incident ack |
| External pentest | **Not done** — leave `slaPentestAck` false until assessor report |

Commands:

```bash
bash scripts/sla-restore-drill.sh --restore-latest
bash scripts/sla-secret-rotation-drill.sh
WEB_BASE=http://127.0.0.1:3080 bash scripts/scale-smoke.sh
```
