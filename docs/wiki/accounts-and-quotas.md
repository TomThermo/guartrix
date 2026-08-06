# Accounts & quotas

## Roles

| Role | Typical use |
|------|-------------|
| `ADMIN` | Full panel, users, nodes, any server |
| `OPERATOR` | Own servers (within quotas) + granted subuser perms |
| `VIEWER` | Read-oriented; cannot create servers |

## Bootstrap admin

On first API start with an empty user table, Guartrix creates `admin` using `ADMIN_PASSWORD` from `.env`.

## Registration

- Enabled when `REGISTRATION_ENABLED` is not false.
- Strong password: 12+ chars, upper, lower, number, symbol.
- New users must **verify email** before pending subuser invites are linked.
- Invite acceptance and email-based subuser linking require `emailVerified` (even without SMTP — verify via outbox link or admin).
- When `SMTP_HOST` is set, verification is required **before login** (no session on register). Without SMTP, accounts still get a session and mail goes to `data/mail-outbox/`.
- Default quotas for new users: **0** servers, **0** RAM, **0** databases (`DEFAULT_MAX_*`).

![Register](assets/17-register.png)

Raise quotas on **Users** (admin) when a plan is sold, or let customers pay via
**Mollie** ([Application API & billing](application-api.md)). Quotas remain the gate.

![Users / quotas](assets/04-users.png)

UI tour: [Panel guide](panel-guide.md)

## Password reset

1. `/forgot-password` — same response whether or not the email exists (no enumeration).
2. One-hour reset link → `/reset-password?token=…`
3. On success, all sessions for that user are purged.

Without SMTP, messages are written under `data/mail-outbox/`.

## Two-factor authentication (TOTP)

- Optional for every account under **Security** (`/account/security`).
- Scan a QR code (or type the secret) into Google Authenticator, Authy, 1Password, … then save the one-time recovery codes.
- Login is password → 6-digit code (or a recovery code). **SFTP** accepts the panel password or an **app password** (`gtap_…`) from Account → Security.
- Set `TWO_FACTOR_REQUIRED_ROLES=ADMIN` (or `ADMIN,OPERATOR`) so those roles must enrol before any mutating API call succeeds. Admins can **Reset 2FA** on the Users page if someone loses their device.

## Export & delete account

- **Export data** (Account → Security) downloads a JSON copy of your profile, owned servers, recent activity, subuser memberships, API key metadata (no secrets), and billing rows.
- **Delete account** requires your password and typing `DELETE`. The last admin cannot self-delete. Owned servers are reassigned to another admin when one exists.

## API keys (Client API)

- Create under **Security** → API keys. Token shown once; revoke anytime.
- `Authorization: Bearer gt_…` for scripts (list servers, power, files, …).
- Scoped permissions + optional server allow-list; rate-limited per key.

Details: [Client API](client-api.md)

## Subusers

- Server owners invite by email with fine-grained permissions.
- Every invite generates a copyable **invite link** (`/invite/:token`, valid **7 days**) shown in the Subusers panel and included in the invite mail. The recipient signs in (or registers) with the invited email and accepts on that page. Before sign-in the page only shows a **masked** email hint; the full address appears after login. **Invite link** on a pending row regenerates the token and resends.
- If no account exists, Guartrix creates a `VIEWER` with **0** quotas and emails a **password setup link** (no temporary password in the API JSON).
- Invitees use SFTP/panel with their own credentials once the password is set.
- `activity.read` grants the server's [Activity log](activity-log.md) tab; subusers who already had `audit.read` (Log Files) keep access.
- Subuser invites, permission changes and removals are recorded in the activity log.

## Admin demotion

Changing a user away from `ADMIN` applies finite default quotas so they do not keep unlimited (`null`) limits. Demoting (or deleting) the **last** admin is rejected so the panel cannot lock itself out of administration.

Client API keys with only `users.write` (and Application keys without `*`) cannot create or promote `ADMIN` accounts — that needs `admin.full` / `*` so a leaked automation key cannot mint a full panel admin.
