# Operations runbook — Phase 1

## Daily
- Check **Overview**: headcount, present today, pending leave, payroll for the
  month, customers and revenue (each card only appears if your role may see it).
- Review **Audit trail** for unexpected user, role or settings changes.
- Confirm the API health check: `GET /api/health` → `{ "ok": true, "db": "postgres" }`.

## Access management
- Create a login in **Staff Management → Users**. Choose the least-privileged
  role that fits; permissions are enforced by the API, not just hidden in menus.
- Deactivate people who leave. Deactivation revokes existing sessions on their
  next request; records and audit history stay intact.
- Password resets return a one-time temporary password. Share it over a trusted
  channel; it cannot be retrieved again.
- Change a role's permissions in **Staff Management → Roles & permissions**.
  Changes apply on the very next API request.

## Payroll and leave
- Preview a draft payroll run, review skipped employees (usually a missing
  salary structure), then lock it. Locked runs are immutable; correct mistakes
  with an adjustment run.
- Marking a run **paid** records one salary expense for reports and the
  dashboard. Posting to a finance ledger arrives with the Finance module
  (Phase 3). Never pay twice.
- Approving leave marks the covered days as `leave` in attendance without
  overwriting a manually recorded day.

## Backups
- Postgres: schedule `pg_dump` (or Supabase's automated backups) and test a
  restore before month-end. Keep exports off-machine; they contain salaries and
  customer data.
- Agree RPO/RTO with the owner. Take a manual dump before any migration or
  manual data cleanup.

## Incidents
- **API cannot boot:** check `DATABASE_URL`, `JWT_SECRET` and that migrations
  `0001`–`0009` are present. `initDb` logs `[db] Supabase Postgres schema ready`.
- **401 for a valid user:** the account may be deactivated, or `JWT_SECRET`
  changed (which invalidates every token).
- **403 on a screen:** confirm the role's permission in the matrix. The API
  response names the required key (`"required": "staff.view"`).
- **Rollback:** tag each release. The web app is a static redeploy; the API is
  the previous build. Never run destructive migrations without a backup.
