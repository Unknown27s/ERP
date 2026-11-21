# MarvelSoftware

A single-deployable ERP for a small company in India: **CRM, HR, staff, leave, finance and inventory** on one shared Postgres database and one REST API. The product name is configured at runtime (seed defaults to *MarvelSoftware*), not hard-coded in the browser.

This repository currently contains **Phase 0 + Phase 1** in full and **Phase 2** in progress: platform setup, authentication, granular roles and permissions, company settings, departments, designations, the audit trail, HR/leave/payroll, and the CRM pipeline (customers, leads, follow-up activities and support cases). Later modules are scaffolded honestly as placeholders rather than filled with sample numbers.

---

## Status

| Module | State | What works today |
|---|---|---|
| Platform / auth | **Phase 1 — done** | JWT login, rate limiting, deactivation revokes sessions immediately |
| Staff management | **Phase 1 — done** | Users, roles, permission matrix, departments, designations |
| Company settings | **Phase 1 — done** | Branding, contact, regional/accounting and invoicing settings, audited |
| Audit trail | **Phase 1 — done** | Append-only log with actor, action, entity, summary and time |
| HR | Phase 2 — partial | Employees, attendance (manual + biometric import), salary structures, payroll runs |
| Leave | Phase 2 — partial | Types, balances, requests, approvals, holidays |
| CRM — customers | Phase 2 — done | Customer records, phone-first lookup, history, consent and occasions |
| CRM — pipeline | **Phase 2 — done** | Leads board/table, follow-up activities, support cases, atomic lead→customer conversion |
| Finance | Phase 3 — planned | Placeholder route with the planned scope |
| Inventory | Phase 4 — planned | Placeholder route with the planned scope |
| Reports / email | Phase 7 — planned | Placeholder routes |

---

## Architecture

```
apps/web            React + TypeScript + Vite SPA (permission-aware shell)
server              Node + Express REST API (the only enforcement point)
packages/validation Shared Zod schemas
packages/types      Shared domain types
supabase/migrations Authoritative Postgres DDL
```

- **One company, one deployable app.** Compose the SPA and API behind one origin; the SPA calls `/api`.
- **Postgres only.** There is no SQLite fallback. `server/src/db.js` requires `DATABASE_URL` (or `SUPABASE_DB_URL`) and applies migrations idempotently on boot.
- **Money** is stored as numeric INR amounts; **dates** are date-only strings (`YYYY-MM-DD`) so time zones cannot shift them.
- **Nothing is hard-deleted.** Deactivate users, departments, designations and holidays. Employees use `status = 'exited'`. Audit rows are never edited.

### Backend stack

| Concern | Current choice |
|---|---|
| Runtime | Node.js 20+, CommonJS |
| HTTP | Express 4 |
| Database | PostgreSQL (Supabase) via `pg` Pool with SSL |
| Migrations | Hand-written SQL in `supabase/migrations`, applied by `server/src/db.js` with an advisory lock |
| Auth | `jsonwebtoken` + `bcryptjs`, permissions re-read per request |
| Validation | Field-by-field checks in routes; `zod` and `packages/validation` are **not wired into the API yet** |
| Email | `nodemailer` |
| Logging | `morgan('tiny')` + `console` |
| Tests | Node's built-in `node:test` runner |
| Scheduling | One in-process campaign scheduler started on boot |

There is no ORM. Reporting, billing and payroll are SQL-heavy, so the raw `get`/`all`/`run`/`withTransaction` helpers remain the data layer. See `docs/current-state.md` §8 for the Prisma evaluation.

---

## Quick start

Prerequisites: Node 20+, a Postgres database (Supabase works), `npm`.

```bash
# 1. Install workspace dependencies
npm install

# 2. Configure environment (repo root)
copy .env.example .env      # Windows
# cp .env.example .env      # macOS/Linux
# edit .env and set DATABASE_URL + JWT_SECRET

# 3. Apply migrations, then seed the demo company
npm run migrate
npm run seed

# 4. Run API (:4000) + web (:5173)
npm run dev
```

Open <http://localhost:5173>. The API is at <http://localhost:4000/api>.

### Docker deployment

The production image is the root [`Dockerfile`](./Dockerfile) (SPA + API in one
container). Apache/Webuzo on the host terminates TLS and proxies to a
loopback-only port; each co-hosted app gets its own Docker network and its own
`8086-8099` port.

```bash
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, SMTP_*
docker compose up -d --build
```

The ERP uses `127.0.0.1:8086`. Full runbook (Webuzo vhost, SSL, seeding,
troubleshooting): [`deploy/README.md`](./deploy/README.md) and
[`deploy/apache/README.md`](./deploy/apache/README.md).

### Branding and logo

The product/company name is read at runtime from `shop_settings` (`product_name`, `company_name`) via `GET /api/config`, so renaming it in **Company settings** updates the login page, sidebar and browser title without a rebuild.

Place the logo at `apps/web/public/logo.png`. The login page and sidebar render it automatically; if the file is missing they fall back to a monogram tile. The favicon uses the same file.

### Demo logins

Seeded by `npm run seed` (change every password before production):

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@marvelsoftware.local` | `Admin@123` |
| Manager | `manager@marvelsoftware.local` | `Manager@123` |
| HR | `hr@marvelsoftware.local` | `Hr@12345` |
| Finance | `finance@marvelsoftware.local` | `Finance@123` |
| Store | `store@marvelsoftware.local` | `Store@123` |
| Sales | `sales@marvelsoftware.local` | `Sales@123` |
| Employee | `employee@marvelsoftware.local` | `Employee@123` |

Rename the company and product in **Company settings**. The login screen and sidebar read `GET /api/config`, so the new name appears immediately.

### Preview sign-in roster

The login screen lists the seeded staff accounts so a reviewer can click a card and have that person's work email **and preview password** filled in for one-click sign-in. This uses the existing person logins — no separate preview mailbox or shared demo password is created.

- Off by default. Set `PREVIEW_LOGIN=1` only on an isolated demo deployment; never expose it with real staff credentials.
- `PREVIEW_EMAILS=a@x,b@y` overrides which accounts appear; by default the roster is the seven seeded logins above.
- `PREVIEW_PASSWORDS=a@x:pass,b@y:pass` overrides the preview passwords (defaults follow the seed credentials).
- `GET /api/config` returns `{ name, email, role, password }` for the roster while preview is enabled. Treat that endpoint as demo-only and disable it before real staff use.


---

## Roles and permissions

Permissions are checked **on the server** for every protected route. Hiding a menu item is only a convenience.

| Permission | Grants |
|---|---|
| `staff.view` / `staff.manage` | Read users/roles/org structure · create, edit, deactivate users |
| `roles.manage` | Create roles and change the permission matrix |
| `company.manage` | Edit company settings |
| `hr.view` / `hr.manage` | View HR records · create/edit employees, attendance, departments |
| `leave.view` / `leave.manage` / `leave.approve` | View leave · configure types/holidays · approve requests |
| `finance.view` / `finance.manage` | View books · post journals/invoices (Phase 3 routes) |
| `inventory.view` / `inventory.manage` | View stock · create items/movements (Phase 4 routes) |
| `crm.view` / `crm.manage` | View customers, leads, follow-ups and support cases · create/edit them |
| `payroll.view` / `payroll.manage` | View salary/payslips · run and pay payroll |
| `reports.view` / `audit.view` | Management reports · audit trail |

Built-in roles: Administrator, Manager, HR, Finance, Store, Sales, Employee. Administrator always has every permission. Legacy `profiles.role = 'admin'` remains a superuser for accounts created before roles existed, and `billing` maps to read-only Sales permissions.

All legacy `requireRoles('admin')` guards have been converted to named permissions. Administrator-only behaviour was preserved by mapping to the closest module permission (for example invoice voiding requires `finance.manage`). The old `requireRoles` helper remains exported for compatibility but is no longer used by any route.

**Acceptance check:** sign in as `employee@marvelsoftware.local` and call a permission you do not hold, for example:

```bash
curl -i http://localhost:4000/api/staff/users \
  -H "Authorization: Bearer <employee-token>"
# HTTP/1.1 403 Forbidden
# {"error":"forbidden","message":"Requires permission: staff.view","required":"staff.view"}
```

The audit trail (`/admin/audit`) then shows who changed what. Phase 1 acceptance is covered by `server/test/foundation.test.js`.

---

## API summary

Public:
- `GET /api/config` — product/company name, timezone, currency
- `GET /api/health`

Authenticated:
- `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout`
- `GET /api/dashboard` — permission-filtered live counts
- Staff: `/api/staff/users`, `/api/staff/roles`, `/api/staff/permissions`, `/api/staff/departments`, `/api/staff/designations`
- Settings: `GET|PUT /api/admin/settings`
- Audit: `GET /api/audit-logs?q=&action=&from=&to=&limit=` (`audit.view`)
- HR / leave / payroll: `/api/hr/*`
- CRM: `/api/customers*`, `/api/offers`, `/api/campaigns*`
- Campaign extras (mounted under admin): `/api/admin/occasions*`, `/api/admin/festivals*`, `/api/admin/email*`
- CRM pipeline: `/api/crm/pipeline`, `/api/leads*`, `/api/leads/:id/convert`, `/api/activities*`, `/api/support-cases*`
- Sales: `/api/sales/draft`, `/api/sales/:id/finalize`, `/api/sales/:id/void`, `/api/sales*`
- Inventory: `/api/categories*`, `/api/products*`, `/api/suppliers*`, `/api/purchases*`
- Email: `/api/email/*` (`company.manage`, or `crm.manage` for offer sends)

All of the above are permission-gated on the server. Errors use a consistent shape: `{ "error": "...", "message": "...", "required": "permission.key" }`.

### CRM screens (SPA)

- `/admin/crm/leads` — board and table views, filters, create/edit, archive.
- Lead detail — contact record, stage changes, follow-ups (add / done / reopen / archive) and the atomic **Convert to customer** dialog (name, phone and full postal address).
- `/admin/crm/support-cases` — filtered list and detail with status, priority and assignee controls.
- `/admin` — open leads, overdue follow-ups and open support cases counters for `crm.view` holders.

---

## Verification

```bash
npm run build -w web                  # tsc --noEmit + vite build
node --check server/src/index.js      # and the other server files
npm run test -w server                # reads DATABASE_URL from the root .env
```

Server tests require a Postgres database and insert temporary fixtures. Use a dedicated test database or Supabase project. `foundation.test.js` verifies the Phase 1 acceptance criteria; the older `roles.test.js`, `hr.test.js`, `billing_flow.test.js` and `api.test.js` cover the inherited modules.

---

## Design system

Palette from the specification (see `apps/web/src/index.css`):

| Token | Value |
|---|---|
| Primary / hover | `#2563EB` / `#1D4ED8` |
| Sidebar / sidebar text | `#0F172A` / `#CBD5E1` |
| Page / card / border | `#F8FAFC` / `#FFFFFF` / `#E2E8F0` |
| Text / secondary | `#0F172A` / `#64748B` |
| Success | `#16A34A` on `#DCFCE7` |
| Warning | `#D97706` on `#FEF3C7` |
| Danger | `#DC2626` on `#FEE2E2` |
| Info | `#0284C7` on `#E0F2FE` |

Legacy CSS variables such as `--color-gold` are kept as aliases that point at the blue palette, so inherited components render correctly without a risky rewrite.

---

## Repository notes

- `server/src/index.js` mounts the Phase 1 routers plus the HR/CRM/sales/inventory routers. Legacy jewellery endpoints (rates, barcodes, public catalogue, billing UI) are no longer routed in the SPA and are scheduled for removal in later phases. Every protected route is now gated by a named permission; no route relies on the legacy `requireRoles` helper.
- Every record lookup and write is scoped by `shop_id`, including detail reads, updates and campaign sends. This is applied manually in SQL and is covered by the Phase 2 tests.
- `docs/implementation-log.md` is the historical record of the previous jewellery build. `docs/operations.md` and `docs/supabase.md` describe the current deployment. `docs/current-state.md` is the living backend status log. `ASSUMPTIONS.md` records product decisions.
- The SPA stores its JWT under `erp_token` (it migrates an old `gs_token` automatically).

---

## Next phases

1. ~~CRM pipeline (leads, enquiries, follow-ups, support cases).~~ **Done** — API and screens (board/table, lead detail, conversion, support cases).
2. Backend hardening: shared validation layer (`zod` is installed but unused), locked document-number series, OpenAPI contract, pagination convention.
3. Finance: chart of accounts, journals, invoices, payments, tax and reports.
4. Inventory: item master, purchase orders, goods receipt and posted stock movements.
5. Payroll → finance postings, PDF payslips and statutory reports.
6. Reports, exports and scheduled email.

See `ASSUMPTIONS.md` for the decisions that need confirmation and `docs/current-state.md` for the detailed backend status.
