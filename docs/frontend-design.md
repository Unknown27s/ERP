# ERP frontend design and implementation plan

Status: proposed implementation contract, 2026-11-27. Documentation only; no dependencies, application behavior, or routes changed.

Related: [audit](./ui-ux-audit.md), [UI/UX specification](./ui-ux-design.md). Preserve the existing demo behavior until its production-separation decision is approved; the audit explains the release risk.

## 1. Keep the existing stack

Use React 18 + TypeScript + Vite, React Router, TanStack Query, Tailwind 3.4, Radix, Lucide, and Inter already in `apps/web/package.json`.

Do not migrate to Next.js, introduce another complete component framework, or upgrade Tailwind simply to obtain a professional appearance. The local `components/ui` directory already provides editable primitives. Current shadcn examples may assume different dependency versions; consult matching documentation before adoption.

## 2. Component ownership

The following paths marked “proposed” do not exist yet. Keep domain state in feature pages/hooks and visual/interaction contracts in shared components.

| Responsibility | Existing starting point | Proposed result |
| --- | --- | --- |
| Workspace chrome | `components/WorkspaceShell.tsx`, `workspace.css` | One permission-aware shell and navigation definition; preserve mobile drawer behavior |
| Page title/actions | `components/PageHeader.tsx`, `OperationalUi.tsx` | Reuse PageHeader and a shared page container across modules |
| Buttons/inputs/badges | `components/ui/` | One supported variant/size set aligned with semantic tokens |
| Form field | `OperationalUi.tsx:Field` | Extend or replace with a field contract for label, hint, error, required state, and invalid state |
| Dialogs | `components/ui/Dialog.tsx`, `components/Modal.tsx` | One Radix-backed implementation; keep a temporary compatibility adapter for legacy callers |
| Registers | `OperationalUi.tsx:Register`, per-page tables | Proposed `components/data-table/` with table, toolbar, pagination, and state components |
| Loading/error/empty | `OperationalUi.tsx:QueryState` and page-specific markup | Proposed `components/feedback/` with mutually exclusive region states and retry support |
| Feature/domain helpers | HR shell and `pages/admin/crm/crmUi.tsx` | Keep stage names, permissions, and workflow rules domain-specific |

Do not turn the ERP into one configurable “universal page” component. Share proven repetition while keeping payroll, CRM conversion, and sale finalization explicit.

## 3. Styling contract

1. Establish semantic CSS variables for canvas, surfaces, text, borders, primary, status, radii, spacing, and focus. Map Tailwind colors to those variables rather than maintaining two independent palettes.
2. Apply tokens inside the workspace where appropriate. Portaled dialogs render outside the workspace subtree, so they must receive the same theme variables through a root theme or explicit portal wrapper.
3. Move legacy classes into a scoped stylesheet after checking actual usage. Rename the global `.grid` layout helper instead of sharing Tailwind's utility name. Check `input/select/textarea` defaults for unintended overrides.
4. Preserve print rules and older invoice/report layouts until tested. Do not delete old selectors solely because they look outdated.
5. Replace raw `.btn`, manual control markup, and scattered hard-coded colors incrementally with shared components. Avoid appending another final override block to `index.css`.
6. Use reduced motion, visible focus, and consistent disabled/pending states. Do not imply complete dark-mode support from a few `dark:` classes; finish light mode first.

Before/after example for state composition (illustrative pseudocode; adapt to actual component props):

```tsx
// Avoid rendering QueryState and an empty Register simultaneously.
if (query.isLoading) return <RegisterSkeleton />;
if (query.isError && !query.data) {
  return <LoadError onRetry={() => query.refetch()} />;
}
if (rows.length === 0) {
  return hasFilters ? <NoMatches onClear={clearFilters} /> : <EmptyRegister />;
}
return <RegisterView rows={rows} refreshing={query.isFetching} />;
```

Also handle refresh failure with retained data explicitly; a populated view must not hide a stale-data warning.

## 4. Data and interaction contracts

### Registers

- Define typed columns with a stable ID, accessible heading, alignment, display formatter, and optional supported sort key.
- Define query state explicitly: search, filters, sort, page, and page size. Put shareable state in URL parameters where practical, without putting personal/sensitive values in URLs.
- Reset page on filter/search changes. Preserve context after edits. Cancel or disregard outdated requests so slower searches cannot overwrite newer results.
- Debounce server search where needed; select timing based on measured response behavior. Do not assume all endpoints accept the same parameters.
- Make pagination controlled. Use actual server totals, not row-array length as a global count.
- Never claim full-dataset sorting when only sorting the current page. Add server support as a separate scoped change if required.
- Use native table semantics first. Consider TanStack Table only when repeated sorting/visibility/selection behavior justifies the dependency. It is not needed to restyle a basic register.

### Forms and mutations

- Share field presentation; preserve API validation as authoritative. Add client-side validation for quicker feedback without inventing different business constraints.
- Show submission state and guard duplicate actions. Keep values on failure.
- For financial/stock operations, wait for server confirmation; do not optimistically mark records paid, posted, or received.
- Invalidate the affected query keys after success. Retain relevant page/filter state.
- Confirm destructive or irreversible operations with entity name, effect, and a specific action label.
- Keep frontend permissions for usability; server authorization remains mandatory. A redesign must not broaden permissions or bypass required transitions.

### Dialogs

Use the installed Radix implementation for focus containment, Escape handling, and restoration. Use `DialogTitle` and a meaningful description where appropriate. When controlling a dialog without a trigger, retain an opener reference and restore focus deliberately, as the drawer already does.

The legacy `dismissible` contract and pending/dirty form behavior need explicit mapping. Migrating to Radix must not accidentally allow overlay dismissal during a critical step. Test nested-dialog callers before retiring the old portal implementation.

## 5. Implementation order

### Phase 0: baseline and release decisions

- Resolve real-data production versus isolated demo requirements. If approved, gate preview shortcuts and update the test that currently requires production fallback credentials. This is not a cosmetic-only change.
- Capture current synthetic-data screenshots for dashboard, staff, employees, customer list, inventory, sale review, settings, and one long dialog.
- Record current API/query capabilities. Reconcile stale README module status separately.

Exit: agreed scope, current baseline, no accidental seed/migration/data writes.

### Phase 1: foundation

- Introduce semantic tokens and a shared spacing/type/size contract.
- Remove utility-name collisions by scoped migration, not broad stylesheet deletion.
- Standardize PageHeader, Button, Input, Field, Badge, and feedback states.
- Consolidate dialog behavior, starting with change password and one legacy modal caller.

Exit: representative components have keyboard, responsive, and state coverage; existing navigation tests still pass.

### Phase 2: reference register and form

- Use Customers as the first repeatable list/detail/edit design, with its actual permissions and current API capabilities.
- Add a shared toolbar, real count/pagination where available, numeric alignment, and distinct empty states.
- Test long names, missing contact data, failed queries, read-only roles, and edit-return context.
- Apply the established pattern to Staff and Employees next.

Exit: one complete, reviewed workflow rather than several partially restyled pages.

### Phase 3: high-consequence workflows

- Improve attendance exceptions, leave decisions, payroll review, sales payment review, stock receiving, and finance posting.
- Keep existing business transitions intact. Review side effects and confirmation copy with a domain owner.
- Move secondary inventory setup forms out of the primary browsing flow.

Exit: normal, pending, denied, failed, and successful paths remain accurate; print/PDF outputs are checked.

### Phase 4: dashboard and polish

- Reduce the initial KPI set and promote real role-specific work queues.
- Replace unsupported live claims with update time and refresh behavior.
- Improve page-finder keyboard interaction and responsive typography.
- Evaluate lazy routes and on-demand export/PDF loading. Measure real loading before setting a performance budget; do not mask warnings by merely raising chunk limits.

Exit: current screenshots, no unresolved severe accessibility/workflow issues in reviewed flows, and documented remaining limitations.

## 6. Verification contract

Run these existing checks after implementation:

```bash
npm run build
npx playwright test --config playwright.sidebar.config.ts
```

Baseline at review: build passed; 16 UI tests passed. They mock APIs and do not replace backend integration tests or a manual accessibility review. The existing screenshot calls capture images but do not compare against approved visual baselines.

Add tests alongside each implemented pattern:

| Area | Required checks |
| --- | --- |
| Shell | Direct route selection, role filtering, drawer Escape/focus, keyboard page navigation |
| Dialog | Initial focus, Tab/Shift+Tab containment, close/restore, dirty and pending dismissal |
| Register | Search reset, filter clearing, pagination bounds, loading vs empty, error/retry, preserved edit context |
| Forms | Label/hint/error associations, retained input on failure, pending/duplicate protection |
| Permissions | View-only UI, denied mutation response, no restricted metrics/data in hidden layouts |
| Responsive | 390px, 768px, 1024px, 1440px; 200% zoom; 320 CSS-pixel reflow; bounded table scroll |
| Content | Long company/person names, large INR amounts, date-only values, zero vs unavailable |
| Financial output | Correct totals/status after existing transitions; unchanged invoice/payslip print and PDF content |

Use synthetic fixtures only. Include automated accessibility checks if deliberately added, plus manual keyboard and screen-reader checks. Neither a passing build nor an attractive screenshot proves accessibility or workflow correctness.

## 7. Reusable instructions for future frontend work

This section is project guidance, not an installed agent skill.

1. Read this document, the UI/UX spec, the audit, and the target feature before editing.
2. Reuse the current stack and local primitives. Consult version-matched library documentation when changing APIs.
3. Make one coherent workflow change at a time; preserve routes, permissions, and server contracts.
4. Design all data/interaction states before considering a screen finished.
5. Avoid fake totals, decorative nonfunctional controls, or unsupported live claims.
6. Verify with tests and current screenshots. State which checks ran and what they do not cover.
7. Do not commit, seed a database, publish a demo, install dependencies, or change authentication policy without appropriate authorization.
