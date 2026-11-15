# Assumptions and decisions — Phases 0–2

This file records the choices made while turning the inherited jewellery application into the ERP described in the build specification. Anything marked **confirm** should be checked by the product owner before the next phase.

## Product and company

- **One company.** The schema keeps a `shops` row for compatibility, but every screen and API assumes a single company with one base currency. Multi-company/multi-branch consolidation is out of scope for Phases 0–1.
- **Product name is runtime data**, not code. `shop_settings.product_name` and `company_name` are served publicly by `GET /api/config`; the login page and sidebar consume it. The seed default is **MarvelSoftware**.
- **India, INR, English.** Currency defaults to INR, time zone to `Asia/Kolkata`, financial year start to `04-01`. The UI does not yet implement GST filing or statutory returns.
- **`COMPANY_NAME` / `COMPANY_LEGAL_NAME`** environment variables only affect seed defaults. Editing **Company settings → Branding** changes the live name without a redeploy.

## Access control

- **Granular RBAC** lives in `permissions`, `roles`, `role_permissions`, and `profiles.role_id`. The API enforces permissions with `requirePermission`; the SPA uses the same keys only to hide screens and buttons.
- **Legacy compatibility:**
  - `profiles.role = 'admin'` remains a superuser (`permissions = ['*']`) for accounts created before the roles table existed.
  - `profiles.role = 'billing'` maps to the Sales read/write permissions.
  - Legacy `requireRoles('admin')` guards have **all been converted** to named permissions. The helper is kept as an unused compatibility export, not as a pattern.
  - Inherited supplier/rate/sales reads are permission-gated too (`inventory.view`, or `finance.view`/`crm.view` for sales history); no authenticated user can read business data without a grant.
- **Permission mapping for former admin-only routes:** staff management → `staff.view` / `staff.manage`; email config → `company.manage`; campaign/offer sending and occasions → `crm.view` / `crm.manage`; gold rates, suppliers and purchases → `inventory.view` / `inventory.manage`; sales draft/finalize → `crm.manage` or `finance.manage`; sale void → `finance.manage`. Administrator keeps full access through `permissions = ['*']`.
- **Every record is scoped by `shop_id`**, including detail reads, updates, deletes and campaign sends. Cross-company ids return `404` (or `400` when the id is a reference on a create), never data.
- **Role changes take effect on the next request**, because permissions are loaded from the database on every authenticated request. No re-login is required.
- **The primary administrator cannot be deactivated or moved off the Administrator role.** New users are never primary.
- **Deactivation revokes access immediately**, including existing JWTs, because `auth` re-reads `profiles.active`.
- **No self-service leave scoping yet.** An Employee can view company HR/leave records because `hr.view` and `leave.view` are company-wide. Row-level "only my own records" filtering should be added when the employee self-service screen is built — **confirm** the desired visibility.

## Data and deletion

- **No hard deletes of business records.** Users, departments, designations and holidays are deactivated (`active = 0`); employees become `exited`. Historical links and audit references stay valid. Test fixtures and explicit administrative cleanup are the only hard deletes.
- **Audit is append-only.** `audit_logs` has no update/delete UI. It is scoped to a company through the actor's profile.
- **Money** is stored as numeric INR amounts (the inherited convention). The pricing package still uses integer paise internally where it is used.
- **Dates** are `YYYY-MM-DD` strings; timestamps are `TIMESTAMPTZ`.

## CRM pipeline (Phase 2)

- **Lead stages** are fixed to `new`, `contacted`, `qualified`, `proposal`, `won`, `lost`. They are API constants, not user-editable master data.
- **A lead becomes `won` only through conversion**, which atomically creates the customer. `PATCH /leads/:id` rejects `stage = 'won'` without a linked customer.
- **Conversion requires a complete postal address** (`address_line1`, `city`, `state`, `postal_code`) because the inherited customer model requires it. A duplicate phone returns `409` rather than silently merging records.
- **Follow-up activities** can target a lead, a customer, or both; they are completed with a timestamp and outcome, and archived (`active = 0`), never deleted.
- **Support cases** use statuses `open`, `pending`, `resolved`, `closed` and priorities `low`, `normal`, `high`, `urgent`. Resolution sets `resolved_at`; reopening clears it.
- **Lead and case codes** are generated per company (`L00001`, `SC00001`). Because rows are archived and never deleted, codes stay unique.
- **Owner/assignee** must be an active user in the same company.
- **Archived records stay out of default lists**; `include_inactive=1|true` returns them.
- **The SPA mirrors those rules.** The lead form does not offer `won`; the convert dialog collects the postal address; the support-case customer link is read-only after creation because the API does not allow changing it.

## Scope and flow

- **Phase order is respected.** Phase 0/1 delivers setup, auth, roles, settings, departments, designations and audit. Finance and Inventory show an honest placeholder with the planned scope instead of fake KPIs.
- **Inherited modules kept working:** HR (employees, attendance, payroll), Leave and Customers remain available under permission gates. They are intentionally generic and reusable in later phases.
- **Inherited jewellery screens are no longer routed.** The old Landing, Catalogue, Product Detail, Billing, Rates, Barcodes, Inventory and Reports pages were removed from the SPA in the rebrand commit and remain available in git history.
- **Internal workspace package names** (`gold-shop-platform` root has been renamed to `marvel-software`, but `@gold-shop/pricing`, `@gold-shop/types`, `@gold-shop/validation` remain) are not user-visible. Renaming them is deferred to avoid a lockfile/node_modules churn in the same change.
- **Email** defaults to a generic sender name. SMTP settings are environment-based and are not part of Phase 1 UI. `MAIL_DISABLED=true` suppresses all sends in tests.
- **Postgres only.** No `.env` or database is committed. Migrations `0001`–`0010` are applied automatically on boot and by `npm run migrate`.
- **One in-process scheduler** starts only on a real server boot. It sends approved campaigns whose `schedule_at` has arrived. Tests never start it.
- **The CRM screens are part of this workstream now.** Leads, follow-up activities, support cases and the related dashboard counters are routed in `apps/web`. Backend changes are still documented in `docs/current-state.md`.

## Open questions for the owner

1. Should an Employee see only their own HR/leave/payslip records, or company-wide read access?
2. Which statutory payroll outputs are required first (PF/ESI/PT/TDS returns, Form 16, salary register)?
3. Does payroll posting to Finance use one expense account or department-wise cost centres?
4. Should sales invoices be GST tax invoices from Phase 3, and at what rate composition?
5. Is the company single-branch, or should all modules carry a branch dimension from the start?
6. Which inventory costing method is required — weighted average, FIFO, or standard cost?
7. Are approval workflows (leave, purchase, journal) single-step or multi-level?
8. Should leads auto-assign round-robin, stay with the creator, or be assigned manually?
9. Do support cases need SLA due times and breach warnings, or is priority enough?
10. Should the backend adopt a shared validation schema (`zod` is installed) and a generated OpenAPI contract before Finance?
11. Should document numbers move to a locked `document_series` table (recommended) instead of row counts?
