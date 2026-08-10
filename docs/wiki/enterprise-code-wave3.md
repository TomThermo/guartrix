# Enterprise code — wave 3

Volgende fase na [wave 2+](enterprise-code-wave2.md) (structuur, contracts, UI budgets — **v1.4.28** met E2c servers create/clone/import/delete).

**Enige uitzondering:** load/stress test (geen realistische infra in dev/CI).

Last updated: **2026-08-10** · product **v1.4.28**

---

## At a glance

| ID | Item | Status |
|----|------|--------|
| W3-E5 | Vitest + coverage in CI | 🔄 CI job added |
| W3-E6 | Playwright e2e staging | ⬜ |
| W3-E7 | SLA drills + Go-live attestations | ⬜ |
| W3-E8 | External pentest (operator) | ⬜ |
| W3-E2c+ | Overige fat routes → services | ⬜ transfer, settings, nodes admin |
| W3-X1 | Load/stress test | **blocked** |

Canvas: **enterprise-code-wave3** in Cursor.

---

## W3-E5 — Unit tests in CI

- CI job: `npm test` na `check:enterprise`
- Coverage floors uit `vitest.config.ts` afdwingen
- Uitbreiden: `servers-create`, `servers-lifecycle`, `billing-checkout` service tests

---

## W3-E6 — Playwright e2e

- Workflow met secrets map (staging URL, admin credentials)
- Smoke: login, dashboard, server detail, admin nodes

---

## W3-E7 — SLA (operator)

- [sla-ops.md](sla-ops.md) drills uitvoeren en loggen
- Admin → Go-live attestations invullen
- Scripts: `scripts/sla-restore-drill.sh`, `scripts/sla-secret-rotation-drill.sh`

---

## W3-E8 — Pentest (operator)

- Scope: [pentest-scope.md](pentest-scope.md)
- Externe partij op staging/productie; findings → issues + wiki

---

## W3-E2c+ — Services (rest)

Nog orchestratie in routes:

- `routes/servers/transfer.ts`
- `routes/servers/settings/apply.ts`
- `routes/nodes/admin-*.ts`

Patroon: `services/servers-*`, `services/nodes-admin.ts`.

---

## W3-X1 — Stress test (blocked)

Geen multi-node load sim in repo-CI. Optioneel: `scripts/load-test-k6-template.js` voor operator staging.

---

## Shipped in v1.4.28 (E2c eerste golf)

- `services/servers-create.ts` — panel server create
- `services/servers-lifecycle.ts` — delete + clone
- `services/servers-import.ts` — archive import background job
- Routes `create-routes`, `delete-clone-routes`, `import` verdund
