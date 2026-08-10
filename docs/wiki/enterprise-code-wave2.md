# Enterprise code — wave 2+

Living roadmap for enterprise hardening after the completed [enterprise-split](development.md#enterprise-split) P0–P2 track (v1.4.22–24).

**Enige uitzondering:** load/stress test (geen realistische infra in dev/CI om zinvol te draaien). Al het andere — unit tests, e2e, services-diepte, SLA-drills, pentest-voorbereiding — hoort op de backlog.

Last updated: **2026-08-10** · product **v1.4.30**

---

## At a glance

| ID | Item | Status |
|----|------|--------|
| E1 | CI + `check:enterprise` + routes↛repos **error** | ✅ v1.4.26 |
| E2 | Services layer | ✅ passthrough v1.4.26 · **E2c complete v1.4.30** |
| E3 | Zod + OpenAPI sync | ✅ v1.4.27 |
| E4 | UI size-budget cleanup | ✅ v1.4.27 |
| E5 | Vitest + coverage in CI | ✅ v1.4.31 |
| E6 | Playwright e2e in CI | ✅ v1.4.31 |
| E7 | SLA drills + Go-live attestations (operator) | ⬜ wave 3 |
| E8 | External pentest (operator) | ⬜ wave 3 |

→ Detail: [Enterprise code — wave 3](enterprise-code-wave3.md)

Visual backlog: canvas **enterprise-code-wave2** in Cursor (beside chat).

---

## E1 — CI & gates (shipped)

```bash
npm run check:enterprise   # vandaag: structuur + typecheck
npm test                   # lokaal; nog toevoegen aan CI (E5)
```

Huidige `check:enterprise`:

- `@guartrix/shared` build
- `lint`, `check:boundaries`, `check:openapi`, `check:size-budgets`, `check:wiki-markdown`
- typecheck shared, api, web, daemon

GitHub Actions: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — uitbreiden met E5/E6.

---

## E2 — Services layer

```text
routes/ → services/ → repositories/ → prisma
```

**Done (v1.4.25–30):** domain passthrough modules; alle routes importieren `services/`; dep-cruiser **error** op routes↛repositories.

**E2c shipped:** server create/clone/delete/import (v1.4.28), settings apply, transfer, nodes admin CRUD/install/status (v1.4.30).

---

## E3 — Contracts (done)

Zod in `packages/shared/src/schemas/`; API `schemas/` re-exporteert; OpenAPI sync voor 30 schemas.

---

## E4 — UI budgets (done)

Geen `size-budget: ignore` meer; NodesTable, SecurityPanel, TwoFactor, ServerDetailHeader opgesplitst.

---

## E5 — Unit tests in CI

- `npm test` + coverage floors in GitHub Actions
- Service-layer tests voor hot paths (billing-checkout, servers CRUD, quotas)
- `check:enterprise` uitbreiden of parallel CI job

---

## E6 — Playwright e2e

- Staging workflow (secrets map) zoals in sprint 10/11 bedoeld
- Smoke: login, server list, admin nav

---

## E7 — SLA (operator)

Wiki: [sla-ops.md](sla-ops.md), [sla-contract-template.md](sla-contract-template.md), drill scripts onder `scripts/sla-*`. Admin → Go-live attestations UI bestaat — operator vult drills in.

---

## E8 — Pentest (operator)

Scope-brief: [pentest-scope.md](pentest-scope.md). Externe pentest plannen en uitvoeren op operator-host; bevindingen terugkoppelen naar code/wiki.

---

## Niet haalbaar — stress test

Geen productie-achtige load/stress test in deze repo/CI (geen multi-node swarm, geen duizenden gelijktijdige spelers). Alternatief: operator draait eigen k6/Locust tegen staging; optioneel later een **script-sjabloon** in `scripts/` (geen agent-draai in cloud).

---

## Related

- Wave 1 canvas: **enterprise-split-roadmap** (complete)
- [development.md](development.md) — gates, tests, glossary
- [CHANGELOG.md](../CHANGELOG.md)
