# Enterprise code — wave 3

Operator process + optionele test-diepte **na** afgeronde [wave 2+](enterprise-code-wave2.md) engineering track (**v1.4.31**).

**Enige repo-uitzondering:** load/stress test (geen realistische infra in dev/CI).

Last updated: **2026-08-10** · product **v1.4.32**

---

## At a glance

| ID | Item | Status |
|----|------|--------|
| W3-E7 | SLA drills + Go-live attestations | ⬜ operator |
| W3-E8 | External pentest | ⬜ operator |
| W3-E5+ | Extra service-layer unit tests | ✅ v1.4.32 |
| W3-X1 | Load/stress test template | ✅ k6 template (operator runs) |

**Reeds shipped in wave 2+ (niet herhalen hier):** E5 coverage CI, E6 Playwright CI, E2c services — zie [wave 2+](enterprise-code-wave2.md).

Canvas: **enterprise-code-wave3** in Cursor.

---

## W3-E7 — SLA (operator)

**Checklist:**

1. `bash scripts/sla-restore-drill.sh --backup-only` op **staging**
2. `bash scripts/sla-secret-rotation-drill.sh` (dry-run waar mogelijk)
3. Admin → Settings → Go-live — attestations invullen
4. Log in [sla-drill-log.example.md](sla-drill-log.example.md)

Wiki: [sla-ops.md](sla-ops.md) · scripts onder `scripts/sla-*.sh`

---

## W3-E8 — Pentest (operator)

**Checklist:**

1. Scope afstemmen: [pentest-scope.md](pentest-scope.md)
2. Staging URL + test accounts aan leverancier
3. Bevindingen → GitHub issues + wiki security pagina
4. Go-live attestation “pentest scheduled or done” invullen

**Done when:** extern rapport + remediations door operator/customer afgehandeld.

---

## W3-E5+ — Service tests ✅ v1.4.32

- `services/servers-create.test.ts` — quota, node, port, success path
- `services/billing-checkout.test.ts` — Mollie gates + checkout URL
- `services/servers-transfer.test.ts` — initiate + idle view

---

## W3-X1 — Stress test (operator)

Repo-CI blijft geblokkeerd. Operator template:

```bash
K6_BASE_URL=https://staging.example.com k6 run scripts/load-test-k6-template.js
```

Zie `scripts/load-test-k6-template.js` (health + login page load smoke).

---

## Shipped (wave 2+ reference)

| Version | Item |
|---------|------|
| v1.4.28 | E2c: servers-create, lifecycle, import |
| v1.4.30 | E2c+: settings-apply, transfer, nodes-admin |
| v1.4.31 | E5 coverage CI, E6 Playwright CI |
| v1.4.32 | W3-E5+ service tests, k6 load template, operator checklists |

Detail: [enterprise-code-wave2.md](enterprise-code-wave2.md).
