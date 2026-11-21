# Generic ERP workflow implementation

## Decisions and scope
- Generic ERP confirmed by the owner: item quantities, explicit unit prices and tax rates; no gold-rate dependency for new invoices.
- Preserve historical jewellery invoices and columns. Do not infer retail prices from acquisition cost or rewrite historical money.
- Connect inventory intake, draft reservations, payment/finalization, invoice viewing, expense register, and outbound email configuration/templates/logs.
- Finance is an operational receipts/expenses register, not a certified double-entry accounting package. Label it truthfully.
- Inter typography; permission-filtered collapsible navigation; one top-header logout.

## Backend and security
- Self-service leave endpoints enforce ownership. HR leave reads require HR/approval authority; mutations require management authority.
- Serialize payroll preview/lock/pay per shop using transaction-scoped advisory locks, and reload status inside the transaction. All draft replacement is atomic.
- Generic stock quantities and reservations are nonnegative; product rows locked in deterministic order for sales, cancellation, intake and refunds. Snapshot unit prices/taxes in draft lines. Validate finite money, integer quantities, company references and payment methods server-side.
- Existing products require explicit selling-price setup before sale. New migrations are additive and registered.
- Logout revokes backend tokens, cancels in-flight queries and clears cached private data. Handle unauthorized responses globally. Password changes revoke other sessions.

## Frontend workflows
- Employee login lands in self-service. Others land in overview. Portal tabs follow URLs.
- Staff onboarding can create a linked employee in the same transaction when the operator has staff.manage and hr.manage. Joining date/code are explicit, salary remains an explicit payroll step.
- View-only users never see mutation actions. Disabled/unavailable modules are not advertised as working accounting.
- Each new screen has loading, error and empty states, labelled controls and real API mutations.

## Acceptance and validation
- Employee cannot list, submit or cancel another employee's leave through HR endpoints.
- Logout invalidates the token and a subsequent user cannot see prior cached profile/payroll data.
- Repeated/concurrent payroll pay produces one expense; failed regeneration rolls back.
- Inventory intake → quantity-based draft → exact payment → invoice → void restores quantities once.
- Seven built-in roles have browser navigation/permission tests; employee task/leave, sales checkout, stock intake, finance expense and admin email/onboarding flows covered.
- Database tests use an isolated local Postgres only; do not migrate/seed the user's configured database without approval. Mocked browser tests are explicitly identified as mocked, not live integration evidence.
