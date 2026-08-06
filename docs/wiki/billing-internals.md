# Billing internals

Billing in Guartrix combines end-user checkout, admin-managed plan templates, quota application, optional subscription logic, and a machine-facing Application API.

## Core components

Main implementation areas:

- `apps/api/src/routes/billing/` (user / admin / application route modules)
- `apps/api/src/routes/application.ts` (where applicable)
- `apps/api/src/billing/` — domain modules behind barrel `billing.ts`:
  - `billing-records.ts` — plan/payment/subscription serializers
  - `billing-provision.ts` — apply plan, auto-create server, provision paid payment
  - `billing-subscriptions.ts` — Mollie subscription ensure/cancel/revoke
  - `billing-webhook.ts` — outbound `BILLING_WEBHOOK_URL`
  - `billing-mollie-sync.ts` — Mollie status sync helpers
- `apps/api/src/auth/application-keys.ts`
- `apps/api/prisma/schema.prisma` models `PlanTemplate`, `Payment`, `BillingSubscription`

## Plan templates

Plan templates are the operator-defined product catalog. They can encode:

- price in cents
- server, memory, and database quotas
- one-off or recurring payment mode
- optional auto-create-server defaults
- enabled/disabled state

This is the bridge between commerce and actual hosting capacity.

## Mollie flow

The panel's first-party billing flow is:

1. User starts checkout from the Billing page.
2. Panel creates a Mollie payment.
3. User pays on Mollie.
4. Mollie webhook hits the public billing webhook route.
5. Panel fetches payment status and applies quotas idempotently.
6. Optional recurring subscription or auto-create flow continues.

The return page can also request a sync if the webhook arrives later than the browser redirect.

## Quota application

Payments do not directly create unlimited access. The billing layer updates the same quota model used by admin actions and registration defaults.

This is why billing documentation belongs next to accounts/quotas as well as API/integration docs.

## Subscriptions

Recurring plans add more moving pieces:

- Mollie customer linkage
- local `BillingSubscription` state
- follow-up renewals
- cancellation
- revocation or suspension on failed renewals

Some failed renewal cases can reduce quotas back toward defaults and stop running servers when entitlements disappear.

## Application API

The Application API exists so an external storefront or automation layer can:

- create or update users
- raise quotas
- create servers
- inspect plans and payments

This is admin/machine auth, not end-user auth. See [Application API & Mollie](application-api.md).

## Outbound hooks and auditability

Billing can also notify an external service through `BILLING_WEBHOOK_URL`. Payment and subscription events should still be treated as panel-audited data because the panel remains the system applying entitlements.

## Related

- [Application API & Mollie](application-api.md)
- [Accounts & quotas](accounts-and-quotas.md)
- [License flow internals](license-flow-internals.md)
