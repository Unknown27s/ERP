# Current state — living document

> **Purpose.** This is the working record the product owner asked for: what
> works, what is pending, what was changed beyond the explicit request, what is
> blocked, and what needs a decision. Update it at the end of every work
> session, especially while the frontend is being changed by a separate agent.
>
> **Last updated:** 2026-11-12 (Phase 2 backend + permission/tenant hardening)
> **Scope of this entry:** Phase 2 — CRM pipeline, granular permissions cleanup,
> dashboard counters, migrations, tests, documentation, and the hardening pass
> recorded in §14.

## 0. Working agreements from the owner

- **Do not run API/server tests without asking first.** Test runs are paused
  until the owner approves. Static checks (`node --check`, TypeScript) are fine.
- **The frontend is owned by another agent.** Do not edit `apps/web` unless the
  owner explicitly asks for a specific change. When such a change is requested,
  make the smallest possible edit and record it here.
- **Record unrequested changes and blockers in this file.**

---

## 1. Status at a glance

| Area | Backend | UI | Notes |
|---|---|---|---|
| Platform, auth, RBAC, audit | **Working** | **Working** | Phase 0/1; permissions enforced server-side |
| Company settings / branding | **Working** | **Working** | Runtime product name via `/api/config` |
| Staff, departments, designations | **Working** | **Working** | Soft-deactivated, never hard-deleted |
| HR — employees, attendance, salary, payroll | **Working** | **Working** | Phase 2 scope present; statutory outputs not built |
| Leave — types, balances, requests, approvals, holidays | **Working** | **Working** | Company-wide visibility (self-service scoping is an open question) |
| CRM — customers, phone lookup, occasions | **Working** | **Working** | Inherited Phase 2 base |
| CRM — leads / pipeline | **Working** | **Pending (frontend agent)** | New in this session (`/leads`, `/crm/pipeline`) |
| CRM — follow-up activities | **Working** | **Pending (frontend agent)** | New in this session (`/activities`) |
| CRM — support cases | **Working** | **Pending (frontend agent)** | New in this session (`/support-cases`) |
| Finance | Placeholder | Placeholder | Phase 3 |
| Inventory | Placeholder | Placeholder | Phase 4 |
| Reports / email | Partial | Placeholder | Read APIs exist; UI still Phase 7 placeholders |

Legend: **Working** = implemented and exercised by tests; **Pending** = API
exists but no screen yet; **Placeholder** = intentionally honest, no fake data.

---

## 2. Phase 2 delivered (this session)

### 2.1 Database

New migration `supabase/migrations/0010_crm_pipeline_pg.sql`, registered in
`server/src/db.js`:

- `crm_leads` — lead code, contact details, source, stage, estimated value,
  owner, linked customer, lost reason, next follow-up date, soft-delete flag.
- `crm_activities` — call/meeting/email/note/task/WhatsApp follow-ups tied to a
  lead and/or customer, due date, done timestamp, outcome, soft-delete flag.
- `crm_support_cases` — case code, customer, subject/description, status,
  priority, assignee, opened-by, resolved timestamp, soft-delete flag.

All tables are tenant-scoped by `shop_id` and indexed for their main filters.

### 2.2 API (new: `server/src/routes/crm-pipeline.js`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/crm/pipeline` | `crm.view` | Counts/value by stage, overdue follow-ups, open cases |
| GET | `/api/leads` | `crm.view` | Filter by `q`, `stage`, `owner`, `due`, include archived |
| POST | `/api/leads` | `crm.manage` | Capture a lead |
| GET | `/api/leads/:id` | `crm.view` | Lead + its open activities |
| PATCH | `/api/leads/:id` | `crm.manage` | Edit details, stage, owner, follow-up |
| DELETE | `/api/leads/:id` | `crm.manage` | Archive (`active = 0`) |
| POST | `/api/leads/:id/convert` | `crm.manage` | Atomically create the customer and win the lead |
| GET | `/api/activities` | `crm.view` | Filter by lead/customer/kind/due/done |
| POST | `/api/activities` | `crm.manage` | Log a follow-up |
| PATCH | `/api/activities/:id` | `crm.manage` | Reschedule / mark done / record outcome |
| DELETE | `/api/activities/:id` | `crm.manage` | Archive |
| GET | `/api/support-cases` | `crm.view` | Filter by status/priority/customer/assignee |
| POST | `/api/support-cases` | `crm.manage` | Open a case |
| GET | `/api/support-cases/:id` | `crm.view` | Case detail |
| PATCH | `/api/support-cases/:id` | `crm.manage` | Status, priority, assignee, details |
| DELETE | `/api/support-cases/:id` | `crm.manage` | Archive |

Business rules encoded:

- **Conversion is atomic** (`withTransaction`): creating the customer and
  marking the lead `won` either both succeed or both roll back.
- **No silent duplicates.** Conversion returns `409` if the phone already
  belongs to a customer, with the existing records in `data`.
- **Winning requires conversion.** `PATCH /leads/:id` rejects `stage = 'won'`
  unless the lead is already linked to a customer.
- **Archive, never delete.** Leads, activities and cases set `active = 0`;
  rows remain for history and audit.
- **Tenant isolation.** Every read/write filters by `shop_id`, including
  lookups by id. Cross-company ids return `404`/`400`, never data.

### 2.3 Permissions cleanup

- Replaced the remaining legacy `requireRoles('admin')` guards in `crm.js`:
  offers/campaigns now use `crm.view` / `crm.manage`; report reads use
  `reports.view`.
- Cost/margin fields are now gated by `finance.view`, not by legacy role names:
  - `/reports/sales` → `gross_profit_estimate` is `null` without `finance.view`
  - `/reports/category-products` → strips `acquisition_cost_inr`
  - `/reports/inventory` → strips `acq_inr`
- Dashboard CRM counters (`open_leads`, `overdue_follow_ups`,
  `open_support_cases`) are only returned to users with `crm.view`.

### 2.4 Tests

New `server/test/phase2.test.js` (7 tests) covers:

1. CRM routes reject users without `crm.view` / `crm.manage` (403 with `required`).
2. Lead lifecycle, search, guarded win and one-time conversion (audited).
3. Overdue follow-ups, marking done, and archive-instead-of-delete.
4. Support case status lifecycle (resolve → reopen → archive).
5. Cross-company isolation for reads, activity attachment and archive.
6. Cost fields hidden from non-finance report readers.
7. Former admin-only routes (staff, settings, email, rates, festivals, suppliers,
   sales drafts) now answer to their named permissions instead of the legacy
   admin flag.

Verification results are in §6.

---

## 3. Frontend handoff (another agent owns `apps/web`)

**Do not edit frontend files in this workstream unless explicitly asked.**
The frontend changes frequently. The Phase 2 backend is ready for these screens:

- **Leads pipeline** — board or table using `GET /leads`, stage changes via
  `PATCH /leads/:id`, convert dialog via `POST /leads/:id/convert` (must collect
  `address_line1`, `city`, `state`, `postal_code`).
- **Lead detail** — lead fields + `GET /leads/:id` activities, with
  `POST/PATCH /activities` for follow-ups.
- **Support cases** — list/detail using `/support-cases`, status/priority
  controls, assignee picker from `/staff/users`.
- **Overview** — optional CRM counters from `/dashboard` or `/crm/pipeline`.

Suggested permission wiring (UI convenience only; the API is authoritative):
`crm.view` shows CRM screens, `crm.manage` shows create/edit/convert controls.

---

## 4. Database and data policy

- Migrations `0001`–`0010` are applied automatically on boot and via
  `npm run migrate`. The runner records names in `schema_migrations`.
- The live database currently has the renamed company, `MarvelSoftware`, and
  the seven demo logins at `@marvelsoftware.local`.
- Business records are never hard-deleted by application code: users,
  departments, designations, holidays, leads, activities and cases are
  deactivated/archived; employees become `exited`.
- Demo credentials remain in the seed and README and must be changed before
  production.

---

## 5. Decisions and assumptions added in Phase 2

1. **Lead stages** are fixed to `new`, `contacted`, `qualified`, `proposal`,
   `won`, `lost`. Changing them is an API constant change, not a DB migration.
2. **Support statuses** are `open`, `pending`, `resolved`, `closed`; priorities
   are `low`, `normal`, `high`, `urgent`.
3. **Lead codes** (`L00001`) and case codes (`SC00001`) are generated from the
   company's row count. Rows are never deleted, so codes stay unique.
4. **Owner/assignee** must be an active user in the same company.
5. **Conversion requires a complete postal address**, because the inherited
   customer model requires name, phone and a full address.
6. **Activities may target a lead, a customer, or both.** A lead's existing
   customer link is copied automatically.
7. **Archived records stay out of default lists**; use
   `include_inactive=1|true` to include them.
8. **Phone/email validation:** phone must normalize to 7–12 digits; email is
   optional but validated when supplied.

---

## 6. Verification log

Commands run and results (2026-11-12). **API tests are now paused at the
owner's request; nothing below was run after that instruction.**

```text
npm run migrate                                  # applied 0010_crm_pipeline_pg.sql
npm run test -w server -- test/phase2.test.js    # 6/6 pass (BEFORE dashboard counters and hardening)
node --check server/src/routes/crm-pipeline.js   # passed
node --check server/src/routes/crm.js            # passed
node --check server/src/**/*.js                  # 31/31 files pass (after hardening)
npx tsc --noEmit -p apps/web/tsconfig.json       # passed (earlier, before the Dashboard copy removal)
```

**Not yet verified (needs owner approval to run API tests):**

- `/dashboard` now returns `open_leads`, `overdue_follow_ups` and
  `open_support_cases`. The phase-2 test gained assertions for these fields, but
  that updated test has not been executed.
- The full server suite has **not** been run since the Phase 2 files were added.
  The earlier 28/28 result belongs to the pre-Phase-2 suite.
- The Dashboard copy removal has not been rebuilt/type-checked; it was a
  self-contained card deletion plus one unused icon import.

Record the failing test and likely cause here once the owner approves a run.


---

## 7. Changes made that were not explicitly requested

Recorded here because the owner asked to be told about unrequested edits.

### Earlier rebrand session

- Renamed every `Acme`/`acme` reference to MarvelSoftware, including demo email
  domain `@marvelsoftware.local`, package name `marvel-software` and Docker
  images. The live database demo emails/settings were updated in place
  (passwords and row ids preserved).
- Removed the old jewellery `logo.png` and `favicon.png`; added
  `BrandMark.tsx` (renders `/logo.png`, falls back to a monogram), and pointed
  the favicon at `/logo.png`. **The supplied logo image was not accessible on
  disk**, so the fallback is currently shown until the file is saved as
  `apps/web/public/logo.png`.
- Added `server/test/setup-env.js` and changed the server test script to load
  the root `.env`; previously `npm run test -w server` failed with
  "Missing DATABASE_URL".
- Fixed `GET /api/staff/users` selecting a non-existent `profiles.created_at`.
- Added an explicit `404` for removed `/api/public/*` routes; it previously
  fell through to an auth-guarded router and returned `401`.
- Recreated `.env.example` after it was missing.
- Added a "Branding and logo" note to `README.md`.

### Phase 2 session

- Added `docs/current-state.md` (this file).
- Extended `/dashboard` with CRM counters. The existing dashboard contract is
  additive: old fields are unchanged.
- Cost fields in report responses are hidden from roles without `finance.view`;
  previously they were exposed to any report reader and depended on obsolete
  legacy role names.
- Replaced legacy `requireRoles('admin')` guards on offers, campaigns and
  reports with granular permissions. Administrator keeps full access because
  it holds every permission.
- **Requested frontend edit:** removed the "System Architecture Overview /
  Clean Enterprise Foundation Active / RBAC Enforcement / Audit Logging /
  UI Stack" promotional card from `apps/web/src/pages/admin/Dashboard.tsx`
  and the now-unused `Sparkles` icon import. This is the only `apps/web` edit in
  this session and was made at the owner's explicit request.

No git commit has been made; all changes are uncommitted in the working tree.

---

## 8. Prisma evaluation (owner question)

**Question:** can Prisma be used to maintain this database/schema?

**Verdict: technically yes, but do not adopt it now.** Treat it as a separate,
planned migration, not a drop-in addition.

Why it is risky here:

- The backend has **~435 raw-SQL call sites** in 12 route files, plus services.
  Prisma would replace the data layer, not sit beside it cleanly. A partial
  adoption means two clients, two connection pools and two sources of truth.
- Migrations are **hand-written Postgres SQL** (`0001`–`0010`) applied
  idempotently by `server/src/db.js` with an advisory lock. Prisma Migrate
  expects its own migration history; running both would fight over schema
  state.
- Tests create and clean fixtures with direct SQL. They would need a parallel
  rewrite at the same time.
- The runtime uses Supabase Postgres with TEXT ids, `?` placeholders converted
  to `$n`, soft-delete flags and date-only strings. Every model would need
  careful mapping (`@map`, `@@map`, types) to avoid changing behaviour.
- Deployment is a single Docker Compose app. Prisma adds `prisma generate`,
  engine binaries and platform-specific build steps to both the API image and
  CI.
- The frontend is being actively changed by another agent; a backend-wide data
  layer rewrite at the same time raises avoidable merge/verification risk.

Safe ways to use Prisma without the rewrite:

1. **Introspection/ERD only (recommended now).** Run `prisma db pull` against a
   disposable database or branch to generate `schema.prisma` for documentation
   and diagrams. Do not add `@prisma/client` to the runtime.
2. **Use Prisma as a schema-diff helper.** `prisma migrate diff` can compare the
   live schema with a reference and produce SQL, which we review and commit as
   a normal numbered migration. Runtime stays raw SQL.
3. **Full migration (future phase, separate branch).** If the owner wants it:
   - freeze backend changes and take a DB backup;
   - `prisma db pull` → review every model/mapping;
   - add `@prisma/client`, define one `PrismaClient` singleton;
   - port one route file at a time behind tests (start with CRM), keeping SQL
     migrations as the DDL authority until all routes are ported;
   - add `prisma generate` to the API Docker build;
   - only then retire `server/src/db.js` raw helpers.

Until the owner chooses option 3, the authoritative schema remains
`supabase/migrations/*_pg.sql`.

---

## 9. Open questions / blockers

1. **Logo file is still missing.** Save the supplied image as
   `apps/web/public/logo.png` (favicon uses the same file).
2. **CRM UI is pending** and owned by the frontend agent (§3).
3. **Employee self-service scoping:** should an Employee see only their own
   HR/leave/payslip records? Currently `hr.view`/`leave.view` are company-wide.
4. **Statutory payroll outputs:** PF/ESI/PT/TDS returns, Form 16, salary
   register — which first?
5. **Payroll → Finance posting:** one expense account or department-wise cost
   centres?
6. **Lead ownership/assignment rules:** should leads auto-assign round-robin,
   stay with the creator, or be assigned manually?
7. **Support SLA:** are due times/response targets needed, or is priority
   enough for Phase 2?
8. **Prisma:** confirm whether to stay on SQL migrations (recommended) or plan
   the full migration in §8.
9. **Logo aspect ratio:** the monogram fallback assumes a square tile; a wide
   wordmark may need a different sidebar treatment once the file is available.
10. **Test approval:** phase-2 tests passed before the dashboard-counter change;
    the updated suite needs the owner's go-ahead to run.

---

## 10. Known gaps (honest list)

- No CRM UI for leads/activities/cases yet.
- No lead import, bulk reassignment, dedupe/merge, attachments, or email/WhatsApp
  logging from activities.
- No notifications for due follow-ups or SLA breaches (counts only).
- HR/leave are company-wide; no self-service scoping.
- Finance and Inventory remain placeholders.
- No GST filing or statutory payroll returns.
- No commits made; working tree includes both this workstream and frontend
  agent changes.

---

## 11. Changelog

| Date | Change |
|---|---|
| 2026-11-12 | Hardening: all legacy guards converted, tenant-scoping holes fixed, supplier audit, campaign scheduler started (§14) |
| 2026-11-12 | Backend audit + open-source comparison recorded (§12, §13); no code changed |
| 2026-11-12 | Removed the "System Architecture Overview" promo card from the dashboard (owner request) |
| 2026-11-12 | Phase 2 backend: migration 0010, CRM leads/activities/support cases, granular permission cleanup, dashboard counters, phase 2 tests |
| 2026-11-12 | Rebrand to MarvelSoftware, logo wiring, live DB rename, test env preload, public-route 404, staff query fix |

---

## 12. Backend audit (2026-11-12)

Read-only inventory of `server/src`. No code was changed for this section.

### 12.1 Size and shape

| Measure | Value |
|---|---|
| JS files in `server/src` | 31 |
| Lines in `server/src` | ~5,360 |
| Route files | 12 |
| HTTP endpoints | 137 |
| Business tables | 46 (plus `schema_migrations`) |
| SQL migrations | 10 (`0001`–`0010`) |
| Permission keys | 19, grouped in 7 modules |
| Default roles | 7 (Administrator, Manager, HR, Finance, Store, Sales, Employee) |
| `await audit(...)` call sites | 77 |
| Transaction sites (`withTransaction`) | 7 |
| Parameterised list queries with `LIMIT ?` | 7 |

### 12.2 What is actually implemented

**Platform** — JWT auth (12 h), bcrypt, login rate limit (20 / 15 min),
per-request profile re-read so deactivation revokes access immediately,
`/api/config` public branding, `/api/health`, consistent 401/403 shapes.

**RBAC** — `permissions`, `roles`, `role_permissions`. Permission checks run in
the API (`requirePermission` / `requireAnyPermission`), with `required` in the
403 body. Legacy `profiles.role = 'admin'` is a superuser shortcut; `billing`
maps to Sales permissions.

**Staff/org** — users, role CRUD, permission matrix, departments, designations,
soft deactivation (`active = 0`).

**Company settings** — branding, contact, regional/accounting, invoicing;
audited. Product name is runtime-editable.

**Audit** — append-only `audit_logs` with actor, action, entity, summary,
reason, timestamp; `/api/audit-logs`.

**HR** — 33 endpoints: overview, departments, designations, branches, employees,
holidays, attendance (manual + import), leave types/balances/requests/decide/
cancel, salary structures, payroll preview/lock/pay, payslips.

**CRM base** — customers (phone-first lookup, addresses, occasions), offers,
campaigns (approve/send/remind/reminders), messaging webhook, report reads,
audit-log read.

**CRM Phase 2** — leads, pipeline, activities, support cases (16 endpoints);
atomic lead→customer conversion; archive instead of delete; tenant-scoped.

**Sales/inventory base** — drafts, finalize (advisory-locked invoice numbers),
void, sales list/detail; categories, products, barcodes, labels; gold rates,
pricing estimate, suppliers, purchases.

**Dashboard** — permission-filtered counters; CRM counters added in Phase 2.

### 12.3 Tooling in use

| Concern | Choice |
|---|---|
| Runtime | Node.js, CommonJS |
| HTTP | Express 4 |
| Database | PostgreSQL (Supabase) via `pg` `Pool`, SSL, `?`→`$n` rewrite |
| Migrations | Hand-written SQL + custom runner with `pg_advisory_xact_lock` |
| Auth | `jsonwebtoken`, `bcryptjs` |
| Validation | Manual per-route checks (no schema library wired) |
| Logging | `morgan('tiny')` + `console` |
| Errors | `express-async-errors` + one JSON error handler |
| Email | `nodemailer` |
| Tests | Node's built-in `node:test` runner |
| Frontend | React + TypeScript + Vite + Tailwind + Radix (separate agent) |

Dependencies that are declared but **not used by the backend**: `zod`
(installed, zero imports) and `vite` (a frontend/build tool, wrongly listed as
a server dependency). Moving `vite` out and either adopting or removing `zod`
is a small, safe cleanup.

### 12.4 Real gaps found

1. ~~**20 legacy `requireRoles('admin')` guards remain.**~~ **Fixed in §14.1.**
   Every route now uses a named permission; `requireRoles` is an unused
   compatibility export.
2. **Tenant scoping is manual, but the known holes are fixed.** Every query
   writes `shop_id = ?` by hand. Detail reads/writes in catalog, CRM, sales and
   ops were corrected in §14.2. A central guard or Postgres RLS is still the
   long-term answer.
3. **No validation schema layer.** Some routes coerce and check field by
   field; others trust the body. `zod` is already a dependency.
4. **Pagination is inconsistent.** Only 7 list queries use `LIMIT ?`; most
   lists return everything. Fine for one shop today, not for growth.
5. ~~**No background job runner.**~~ **Fixed in §14.4.** An in-process
   scheduler for due campaigns now starts on boot. Follow-up reminders are
   still pull-only (counts on the dashboard), which is intentional for now.
6. **Balances are stored, not derived.** Leave balances and stock levels are
   mutable numbers. ERP-grade systems derive them from ledger entries.
7. **No idempotency keys** on `sales/:id/finalize`, `payroll/:id/pay` or
   `leads/:id/convert`. A retried request is protected by state checks, not by
   a request key.
8. **Document numbers use row counts** (`nextCode`) in Phase 2 and a
   `LIKE`-ordered scan for invoices. Concurrent creates can race unless every
   path takes a lock.
9. **No OpenAPI/contract file.** The frontend agent relies on reading route
   code; there is no generated client or type contract.
10. **No structured logging or request ids** beyond the error handler's
    synthetic `correlationId`.

---

## 13. Open-source comparison — what to borrow

Reviewed source (not just docs) from ERPNext/Frappe, Frappe HRMS, Twenty CRM
and InvenTree. Licence note: these are GPL/MIT/AGPL projects — borrow
**patterns and algorithms**, do not copy code into this repo without checking
the licence.

### 13.1 Frappe / ERPNext — document numbering and stock ledger

- `frappe/model/naming.py` implements `NamingSeries` with `#` placeholders and
  a dedicated series row, updated under a lock. It supports date tokens
  (`{YYYY}-{MM}-`) and per-prefix counters.
- `erpnext/.../stock_ledger_entry.py` is an **immutable movement ledger**:
  every receipt/issue writes a row; balances are derived. It raises
  `StockFreezeError` for back-dated entries into a frozen period and validates
  negative stock per inventory dimension.
- **Borrow:** replace count-based `nextCode` with a `document_series`
  (shop, prefix, period, next_value) row locked with `SELECT … FOR UPDATE`;
  add a `stock_ledger` table so on-hand quantity is a sum, not a mutable
  column; add a company `books_frozen_until` / stock freeze date.

### 13.2 Frappe HRMS — leave as a ledger, not a counter

- `leave_application.py` validates active employee, holiday list, leave block
  dates, overlap, half-days and available balance; on submit it creates a
  **leave ledger entry**. Allocation and consumption are separate documents.
- **Borrow:** add `leave_ledger` (allocation, consumption, encashment,
  adjustment) and compute balances from it; reject overlapping requests and
  block-list dates; keep an explicit approval state machine.

### 13.3 InvenTree — concurrency and stock identity

- `stock/models.py` uses conditional `UniqueConstraint` (unique serial per
  part, ignoring NULL/empty), `select_for_update()` to serialize serial
  allocation, status codes with groups, and an audit/tracking event per
  mutation. Locations are a tree (MPTT).
- **Borrow:** conditional unique indexes in Postgres; row locks for any
  generated number; separate serialised unit rows from bulk quantity rows;
  status-code tables instead of free-text statuses; location hierarchy.

### 13.4 Twenty CRM — module boundaries and timeline

- Modules are folders per domain (`person`, `company`, `opportunity`, `task`,
  `note`, `timeline`, `calendar`, `workflow`, …), with a shared metadata layer
  rather than one giant service.
- **Borrow:** when CRM grows, split `crm.js` into customers / leads /
  activities / cases modules; model activities as a timeline target that can
  point at several entity types instead of adding columns per entity.

### 13.5 Concrete next steps, in order

**Hardening (do before Finance)** — small, low-risk, high value:

1. ~~Convert the 20 remaining `requireRoles('admin')` guards to permissions.~~
   **Done in §14.1.**
2. Add `server/src/middleware/validate.js` using the already-installed `zod`,
   and apply it to the Phase 2 + sales + payroll write routes first.
3. Add a shared pagination/filter convention (`?limit&offset&q`) and a
   `document_series` table for lead/case/invoice numbers.
4. Add idempotency keys to finalize/pay/convert.
5. ~~Add a tiny in-process scheduler (or a documented cron contract) for
   follow-up reminders and campaign sends.~~ **Campaign scheduler done in
   §14.4.** Follow-up reminders still need a rule.
6. Publish an OpenAPI file generated from the route table, so the frontend
   agent has a stable contract.

**Phase 3 (Finance)** — the next product module:

- chart of accounts, journals with **balanced double entry** (debit = credit
  enforced in one transaction), general ledger and trial balance;
- invoices, payments, expenses, credit notes, period close/freeze;
- GST (CGST/SGST/IGST) and TDS hooks;
- payroll → finance posting;
- reports: P&L, balance sheet, cash flow, GST summary, ageing.

**Phase 4 (Inventory)** — items, warehouses, stock ledger, transfers,
purchases, valuation (FIFO/weighted average), reorder points, stocktake.

**Phase 5+** — projects/tasks, manufacturing (if needed), reports, email/
notifications, then hardening (backups, observability, rate limits, audit
export).

### 13.6 Verdict

The backend is a solid, honest Phase 1–2 foundation: real auth, real
server-side permissions, real audit, real transactions, no fake data. The
hardening pass in §14 removed the two most serious weaknesses (legacy guards and
cross-company detail writes). What remains before Finance is **validation,
locked document numbers, idempotency and a published contract** — all additive
and cheaper to do now than after ledgers and stock exist.

---

## 14. Hardening applied (2026-11-12)

This section records the changes made after the audit. **No API tests were run
at the owner's request**; only static checks were executed (see §14.5).

### 14.1 All legacy role guards converted

`requireRoles('admin')` no longer appears in any route. Mapping used:

| Route group | Permission(s) |
|---|---|
| `/admin/staff` read | `staff.view` |
| `/admin/staff` create/edit/reset | `staff.manage` |
| `/admin/staff/:id/activity` | `staff.view` **or** `audit.view` |
| `/email/settings`, `/email/status`, templates, test | `company.manage` |
| `/email/settings` (read for senders) | `company.manage` **or** `crm.manage` |
| `/email/offers/send` | `crm.manage` |
| `/email/log` | `company.manage` **or** `crm.view` |
| `/occasions/*` reads | `crm.view` |
| `/occasions/send`, `/occasions/auto` write, `/festivals*` writes | `crm.manage` |
| `/gold-rates` read | `inventory.view` |
| `/gold-rates/refresh`, `/gold-rates/override` | `inventory.manage` |
| `/suppliers` create | `inventory.manage` |
| `/purchases` read | `inventory.view` |
| `/purchases` create | `inventory.manage` |
| `/sales/draft`, `/sales/:id/finalize` | `crm.manage` **or** `finance.manage` |
| `/sales/:id/void` | `finance.manage` (reason still required) |

`requireRoles` remains defined in `server/src/middleware/auth.js` for backward
compatibility but is not referenced by any route. Administrator still passes
everything because `permissionsForProfile` returns `['*']`.

### 14.2 Tenant-scoping holes fixed

These queries previously looked up records by id without `shop_id`, which
allowed a user in company A to read or mutate a record from company B if they
guessed an id:

- `catalog.js` — category PATCH, product detail, product PATCH, barcode lookup,
  and the product's sale history. Product PATCH also validates that a new
  `category_id` belongs to the same company.
- `crm.js` — customer detail, customer PATCH, occasion create, campaign
  approve, campaign send, and the customer summary used by phone lookup.
- `sales.js` — draft customer/product lookups, reserve/confirm status updates,
  finalize sale lookup, finalize product/customer updates, and void sale
  lookup.
- `ops.js` — pricing-estimate product lookup, purchase product lookup, product
  update, and purchase response.
- `services/campaigns.js` — `sendCampaign` now accepts and enforces `shopId`;
  the scheduler passes each campaign's own `shop_id`.

Cross-company ids now return `404` (or `400` for a reference on create).

### 14.3 Audit coverage

- `POST /suppliers` now writes a `supplier.create` audit row. It previously
  created a supplier silently.

### 14.4 Scheduler

- `startCampaignScheduler()` already existed in `services/campaigns.js` but was
  never called. It now starts inside `if (require.main === module)` after the
  server boots, so tests and imports still never spawn timers.
- It ticks every 15 minutes (guarded to once per hour) and sends approved,
  unsent campaigns whose `schedule_at` has arrived.

### 14.5 Verification performed

Static only, because API tests are paused:

```text
node --check server/src/routes/admin.js        # ok
node --check server/src/routes/email.js        # ok
node --check server/src/routes/occasions.js    # ok
node --check server/src/routes/ops.js          # ok
node --check server/src/routes/sales.js        # ok
node --check server/src/routes/catalog.js      # ok
node --check server/src/routes/crm.js          # ok
node --check server/src/routes/crm-pipeline.js # ok
node --check server/src/services/campaigns.js  # ok
node --check server/src/index.js               # ok
```

**Still needs the owner's approval to verify with API tests:**

- `phase2.test.js` gained a seventh test covering the new permission mapping,
  and its cleanup now removes `festivals` and `occasion_sends` for the
  throwaway shop. **The updated file has not been executed.**
- The six pre-existing tests were last run before the permission conversion,
  tenant-scoping edits and scheduler start. They must be re-run before these
  changes are trusted in production.
- No migration was added in §14, so the database schema is unchanged.

### 14.6 Remaining items before Finance

1. Shared validation middleware using the installed-but-unused `zod`.
2. `document_series` table with row locking for lead/case/invoice numbers.
3. Idempotency keys on finalize / pay / convert.
4. OpenAPI contract for the frontend agent.
5. A rule for follow-up reminders (the campaign scheduler exists; follow-ups
   are still count-only).
6. Optional: Postgres RLS as a backstop for tenant scoping.
7. Retire the legacy `/api/admin/staff` endpoints. They still create
   `profiles.role = 'billing'` accounts without a `role_id`; the modern path is
   `/api/staff/users` with a real role. They are permission-gated now but should
   be removed once the frontend no longer calls them.


