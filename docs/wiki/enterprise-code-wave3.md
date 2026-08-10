# Enterprise code — wave 3

Operator process + optionele test-diepte **na** afgeronde [wave 2+](enterprise-code-wave2.md) engineering track (**v1.4.31**).

**Enige repo-uitzondering:** load/stress test (geen realistische infra in dev/CI).

Last updated: **2026-08-10** · product **v1.4.31**

---

## At a glance

| ID | Item | Status |
|----|------|--------|
| W3-E7 | SLA drills + Go-live attestations | ⬜ operator |
| W3-E8 | External pentest | ⬜ operator |
| W3-E5+ | Extra service-layer unit tests | ⬜ optional |
| W3-X1 | Load/stress test | **blocked** |

**Reeds shipped in wave 2+ (niet herhalen hier):** E5 coverage CI, E6 Playwright CI, E2c services — zie [wave 2+](enterprise-code-wave2.md).

Canvas: **enterprise-code-wave3** in Cursor.

---

## W3-E7 — SLA (operator)

- [sla-ops.md](sla-ops.md) — incident, restore, secrets, capacity
- Admin → Settings → Go-live — attestations invullen
- Scripts: `scripts/sla-restore-drill.sh`, `scripts/sla-secret-rotation-drill.sh`
- Log voorbeeld: [sla-drill-log.example.md](sla-drill-log.example.md)

**Done when:** operator heeft drills gedraaid en attestations ingevuld (geen agent-taak).

---

## W3-E8 — Pentest (operator)

- Scope: [pentest-scope.md](pentest-scope.md)
- Externe partij op staging/productie; findings → issues + wiki updates

**Done when:** rapport + remediations door operator/customer afgehandeld.

---

## W3-E5+ — Service tests (optional engineering)

Wave 2+ E5 dekt CI coverage op security/pure helpers. Optioneel uitbreiden:

- `servers-create`, `servers-lifecycle`, `billing-checkout` service tests
- Geen CI-gate verplicht — verhoogt vertrouwen in E2c use-cases

---

## W3-X1 — Stress test (blocked)

Geen multi-node load sim in repo-CI. Optioneel: `scripts/load-test-k6-template.js` voor operator staging.

---

## Shipped (wave 2+ reference)

| Version | Item |
|---------|------|
| v1.4.28 | E2c: servers-create, lifecycle, import |
| v1.4.30 | E2c+: settings-apply, transfer, nodes-admin |
| v1.4.31 | E5 test:coverage CI, E6 Playwright CI |

Detail: [enterprise-code-wave2.md](enterprise-code-wave2.md).
