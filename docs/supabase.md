# Supabase (Postgres) setup — 5 minutes

The backend is Postgres-only and talks to Supabase (or any Postgres 14+) when
`DATABASE_URL` is set.

## 1. Create the project
1. Go to https://supabase.com → New project.
2. Save the database password shown at creation time.

## 2. Get the connection string
Project Settings → Database → Connection string → **URI**.

```
postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres
```

Use the **direct connection** only if your machine/host has IPv6. On an
IPv4-only host the direct `db.<ref>.supabase.co` host is unreachable
(`connect ENETUNREACH`) — use the **Session pooler** on port 5432 instead, with
username `postgres.<project-ref>` and host `aws-0-<region>.pooler.supabase.com`.
The pooler is the IPv4-safe choice for migrate/seed and the running API.

## 3. Create the schema
**Option A — CLI (recommended).** Applies every migration in order and records
them in `schema_migrations`:

```bash
cd marvel-software
set DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres
npm run migrate
```

**Option B — SQL Editor.** Paste each file from `supabase/migrations/` in
filename order (`0001_init_pg.sql`, `0002_roles_staff_pg.sql`, …,
`0009_holiday_soft_delete_pg.sql`) and run them. They are idempotent.

The API also applies pending migrations on boot (`initDb`), so a fresh deploy
self-heals as long as the connection string is valid.

## 4. Seed demo data
```bash
npm run seed
```

This creates the company (default **MarvelSoftware**), the role catalogue and one
login per role. Override the initial name with `COMPANY_NAME` / 
`COMPANY_LEGAL_NAME` in `.env` before seeding.

Demo logins: `admin@marvelsoftware.local / Admin@123`, `manager@marvelsoftware.local / Manager@123`,
`hr@marvelsoftware.local / Hr@12345`, `finance@marvelsoftware.local / Finance@123`,
`store@marvelsoftware.local / Store@123`, `sales@marvelsoftware.local / Sales@123`,
`employee@marvelsoftware.local / Employee@123`. Change them in production.

## 5. Point the server at Supabase
```bash
# .env at the repository root
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"
JWT_SECRET="<32+ random chars>"
PORT=4000
```
```bash
npm run dev -w server
```
`GET /api/health` returns `{"ok":true,"db":"postgres",...}`.

## Notes
- `DATABASE_URL` is required — there is no SQLite fallback.
- The backend connects with the database/service role, so it bypasses RLS. Keep
  the connection string server-side only; never expose it to the web app.
- Business records are deactivated, not deleted. Take a `pg_dump` before any
  manual cleanup.
- The inherited `packages/pricing` engine is retained for the legacy routes but
  is not used by the Phase 1 screens.
