# ERP integration change summary

## Frontend

- Unified workspace shell with a light slate sidebar, blue selected states, collapsible module groups, profile footer, page search, and one header sign-out action.
- Mobile navigation uses the existing Radix Dialog for focus trapping, Escape/outside dismissal, and focus restoration. Navigation follows role permissions.
- Local Inter assets cover weights 400–800. Shared operational forms now have explicitly associated labels.
- Inventory supports item pricing, quantities, receiving stock, categories, suppliers, and receipt history.
- Sales supports quantity-based drafts, stock reservations, exact payments, draft cancellation, invoices/PDFs, and auditable refund recording.
- Finance shows receipts/expenses and supplier payment recording. It is explicitly not a double-entry accounting system and does not initiate bank transfers.
- Email screens expose gateway verification, templates, and delivery history without sending SMTP credentials to the browser.
- Staff onboarding can create a linked employee. View-only actions follow the relevant permissions.
- Demo shortcuts remain available in production. Server-configured preview accounts take priority over the seeded defaults.

## Backend

- Additive `0015_generic_erp_workflows` migration preserves historical invoice values and adds generic prices, taxes, quantities, reservations, and line-cost snapshots. The pulled `0014_employee_task_times` migration remains registered.
- Server-enforced product/stock validation, exact payment totals, shop scoping, deterministic stock locks, and transactional draft/finalize/cancel/refund/purchase-payment operations.
- Malformed line objects, invalid quantities, and blank/nonfinite money are rejected. Database uniqueness conflicts return 409 without exposing raw database details.
- Cost snapshots are hidden from sales readers without cost visibility permissions.
- HR leave access is separated from employee self-service. Concurrent cancellation/rejection cannot overwrite a completed approval.
- Payroll preview, lock, and pay are serialized transactionally; repeated payments cannot post duplicate salary expenses.
- Logout and password changes revoke sessions; the frontend cancels queries and clears private cached data on sign-out.

## Preserved GitHub updates

The two incoming commits retain employee work details, timed tasks, report updates, permission-aware dashboard changes, shared toast notifications, and runtime preview account configuration. Local workflows were reconciled with them rather than replacing the incoming changes wholesale.

## Verification and remaining work

- Production build/typecheck passed.
- 52 backend checks passed against a newly created, isolated local PostgreSQL database via `npm run test:isolated`.
- 16 browser checks passed against a production preview with mocked API responses.
- Deeper browser workflow coverage is deferred as requested. SMTP delivery, deployed demo credentials, and external refund/payment execution were not tested.
- No migrations or seeds were run against the configured application database. Production deployment is separate from the Git push.
- Shared demo administrator credentials grant full access; demo data is not isolated. Do not put confidential data into that shared environment.

GitHub reuse recommendations and licenses are recorded in `docs/admin-ui-reuse.md`.
