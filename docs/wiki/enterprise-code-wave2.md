# Enterprise code — wave 2+

**Engineering track complete** — structuur, services, contracts, UI budgets, unit coverage CI, Playwright e2e CI (v1.4.22 → **v1.4.31**).

Volgt op [enterprise-split](development.md#enterprise-split) P0–P2 (v1.4.22–24). Operator-only vervolg (SLA drills, pentest): [Enterprise code — wave 3](enterprise-code-wave3.md).

**Enige uitzondering (repo/CI):** load/stress test — geen realistische multi-node infra in dev/CI.

Last updated: **2026-08-10** · product **v1.4.35**

---

## At a glance

| ID | Item | Status |
|----|------|--------|
| E1 | CI + `check:enterprise` + routes↛repos **error** | ✅ v1.4.26 |
| E2 | Services layer (passthrough + E2c orchestration) | ✅ v1.4.30 |
| E3 | Zod + OpenAPI sync (30 schemas) | ✅ v1.4.27 |
| E4 | UI size-budget cleanup | ✅ v1.4.27 |
| E5 | Vitest + coverage floors in CI | ✅ v1.4.31 |
| E6 | Playwright e2e in CI (+ staging workflow) | ✅ v1.4.31 |
| E7 | SLA drills + Go-live attestations | ✅ v1.4.34 (live 2026-08-10) |
| E8 | External pentest (assessor report) | ⬜ operator — Go-live ack ≠ rapport |
| X1 | Load/stress test | **blocked** (operator staging only) |

Visual summary: canvas **enterprise-code-wave2** in Cursor.

---

## Quality gates (today)

```bash
npm run check:enterprise   # shared build + lint + boundaries + openapi + sizes + wiki + typecheck
npm run test:coverage      # Vitest + coverage floors (same as CI test job)
npm run test:e2e           # Playwright (live panel or bash scripts/e2e-ci.sh)
```

**CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

1. `check:enterprise`
2. `npm run test:coverage`
3. Playwright e2e — MySQL service, panel boot, login smoke (`E2E_LOGIN=1`)

Staging e2e (optional): [`.github/workflows/e2e-staging.yml`](../.github/workflows/e2e-staging.yml) — repo var `E2E_STAGING_ENABLED=1` + secrets.

---

## E1 — CI & gates ✅

| Ship | What |
|------|------|
| v1.4.25 | `check:enterprise`, GitHub Actions workflow |
| v1.4.26 | `routes-no-repositories` **error** in dependency-cruiser (0 violations) |

`check:enterprise` runs: shared build, Biome lint, boundaries, OpenAPI sync check, file size budgets, wiki markdown, typecheck (shared, api, web, daemon).

---

## E2 — Services layer ✅

```text
routes/ → services/ → repositories/ → prisma
```

| Ship | What |
|------|------|
| v1.4.25–26 | Domain passthrough; all routes import `services/` |
| v1.4.28 | E2c: `servers-create`, `servers-lifecycle`, `servers-import` |
| v1.4.30 | E2c+: `server-settings-apply`, `servers-transfer`, `nodes-admin` |

Routes blijven dunne HTTP shells (auth, Zod parse, status codes). Orchestratie zit in `apps/api/src/services/`.

---

## E3 — Contracts ✅

- Zod in `packages/shared/src/schemas/`; API `schemas/` re-exporteert
- `scripts/sync-openapi-server-schemas.mjs` — 30 server schemas in sync met shared Zod
- `npm run check:openapi` in `check:enterprise`

---

## E4 — UI budgets ✅

Geen actieve `size-budget: ignore` meer. O.a. opgesplitst: NodesTable, SecurityPanel, TwoFactor, ServerDetailHeader, billing user routes.

---

## E5 — Unit tests in CI ✅

| Ship | What |
|------|------|
| v1.4.31 | CI job `test:coverage` — floors uit `vitest.config.ts` |

Coverage scope (security/pure helpers): auth csrf/rate-limit/password, `safe-url`, `server-access`, shared permissions/bytes/daemon-jwt/license-ticket, file-manager paths. **Floors:** lines/statements ≥95%, functions ≥90%.

**Optioneel later (wave 3):** extra service tests (`servers-create`, `billing-checkout`, …) — geen blocker voor wave 2+ afsluiting.

---

## E6 — Playwright e2e ✅

| Ship | What |
|------|------|
| v1.4.31 | `e2e/smoke.spec.ts`, `e2e/authz-smoke.spec.ts`, CI e2e job |
| v1.4.31 | `scripts/e2e-ci.sh`, `scripts/wait-panel-health.sh`, staging workflow |

Smoke: login page; authenticated login when `E2E_LOGIN=1` (fresh CI DB, geen Turnstile). Authz smokes: CSRF, server list, files tab, admin settings (met `E2E_PASSWORD` op staging).

---

## E7 — SLA drills ✅ (live)

Operator one-shot:

```bash
bash scripts/sla-go-live-drill.sh --live --attest-all
```

Shipped v1.4.33–34: `sla-*-drill.sh`, `panel-settings-attest.mjs`. Live attestations **2026-08-10** on guartrix.com.

## E8 — External pentest ⬜

Go-live `slaPentestAck` = scheduled/done **attestation** only. Assessor report + remediations: [pentest-scope.md](pentest-scope.md) — **not** agent/repo work.

Zie [enterprise-code-wave3.md](enterprise-code-wave3.md).

---

## X1 — Stress test (blocked)

Geen productie-achtige load/stress test in repo-CI. Operator kan k6/Locust op eigen staging draaien; optioneel later script-sjabloon onder `scripts/`.

---

## Version map

| Version | Wave 2+ scope |
|---------|----------------|
| 1.4.25 | E1 start, first services, shared Zod |
| 1.4.26 | Services passthrough, routes↛repos error |
| 1.4.27 | OpenAPI sync, UI budgets |
| 1.4.28–29 | E2c servers + release bundle fix |
| 1.4.30 | E2c+ settings / transfer / nodes admin |
| 1.4.31 | E5 coverage CI, E6 Playwright CI |

---

## Related

- [Enterprise code — wave 3](enterprise-code-wave3.md) — operator SLA/pentest + optional test depth
- Wave 1 canvas: **enterprise-split-roadmap** (complete)
- [development.md](development.md) — gates, tests, glossary
- [CHANGELOG.md](../CHANGELOG.md)
