# ERP frontend UI/UX audit

Reviewed: 2026-11-27. Scope: assess the existing frontend and define a professional ERP design direction; no application changes.

## Summary

MarvelSoftware has a credible visual foundation. The highest-value work is to make daily workflows consistent, accessible, and easier to scan. Replacing the framework or buying a dashboard template would not address those issues by itself.

Recommended direction: retain the current light workspace, neutral surfaces, Inter typography, blue primary actions, and permission-aware navigation. Standardize tables, forms, dialogs, and loading states before adding visual decoration.

Read [UI/UX design](./ui-ux-design.md) for the target experience and [frontend design](./frontend-design.md) for the implementation sequence.

## Evidence and limits

- Inspected the shell, routes, global styles, component primitives, dashboard, login, staff, HR, CRM helpers, inventory, and UI test suite. This is a sampled frontend review, not a full backend/security audit.
- No repository `SKILL.md` or `AGENTS.md` was found by filename searches. Applied the available `code-reviewer` skill and writing guidance. Existing project guidance includes `docs/admin-ui-reuse.md`.
- `npm run build`: passed TypeScript and production build.
- `npx playwright test --config playwright.sidebar.config.ts`: all 16 tests passed.
- Inspected fresh test screenshots at 1440 × 1000 and 390 × 844. APIs were mocked; these are layout evidence, not proof of live workflows or backend enforcement.
- Fresh screenshots are under `/tmp/opencode/erp-sidebar-tests/`. They are temporary test outputs, not committed design assets.
- `screenshots/02_overview_dashboard.png` shows the previous dark sidebar. Current source and fresh screenshots show the light sidebar. Do not use the older image as the current baseline.
- No user interviews, screen-reader audit, measured contrast audit, or production performance measurements were performed.

## Critical: production/demo separation

### Demo credentials are published by default

Evidence: `server/src/index.js:64-149`; `apps/web/src/pages/Login.tsx:56-59,263-298`; `tests/ui/redesign.spec.ts:91-107`.

The login shows the server-configured demo roster with each person's name, role, email and password. The roster is on by default, including production builds, and is limited to the fixed demo mailbox allowlist; every password is checked against the stored bcrypt hash before it is returned. This is a deliberate product decision so reviewers can sign in without a separate credential sheet. It does not bypass authentication or RBAC, and accounts whose passwords have been changed are omitted.

It is not a data-isolation boundary. Before a deployment holds real business data or real staff accounts, set `PREVIEW_LOGIN=0`, rotate the seeded passwords, and isolate the demo tenant/database. The README now documents this default and the opt-out.

## Major findings

| Finding | Evidence | Recommended change |
| --- | --- | --- |
| Three different dialog approaches | `components/Modal.tsx:50-78`, `components/ui/Dialog.tsx`, `components/WorkspaceShell.tsx:127` | Consolidate on the existing Radix-backed wrapper. The legacy modal handles Escape/body scroll but has no focus trap, initial-focus handling, or focus restoration. The inline password dialog also lacks those behaviors. |
| Global styles compete with utility classes | `src/index.css:78,92-93`; `src/main.tsx:9-10`; `tailwind.config.js` | Scope legacy selectors and establish semantic tokens. In particular, unlayered `.grid { gap: 16px }` shares the Tailwind utility name and can defeat intended gap utilities through source order. Verify computed gaps on representative screens during migration. |
| Styling has multiple sources of truth | `src/index.css:5-46,112-172`, `src/workspace.css`, `tailwind.config.js:10-32` | Resolve the legacy warm/dark skins, light-shell overrides, and duplicated palette definitions. Legacy selectors are not proof that the old skin is active everywhere. Remove only after checking usages and print layouts. |
| Operational lists have a minimal shared table | `components/OperationalUi.tsx:19-21`; `pages/admin/Inventory.tsx:34-40` | Introduce one register pattern with a toolbar, count, sorting, pagination, numeric alignment, and distinct states. Add features only where supported by the API/data volume. |
| Loading and empty messages can appear together | `components/OperationalUi.tsx:9-12,19-21`; `pages/admin/Inventory.tsx:25,36-37,61` | Render loading, error, empty, and populated states exclusively. Currently an unresolved query defaults to `[]`, so “Loading…” and “No records yet.” can coexist. |
| Dashboard prioritizes many metrics over immediate work | `pages/admin/Dashboard.tsx`; fresh desktop screenshot | The administrator fixture renders ten KPI cards before the launchpad. Promote approvals, overdue follow-ups, and role-specific work; limit the first metric row to four relevant values. This is a design judgment, not measured user feedback. |
| Freshness copy exceeds query behavior | `pages/admin/Dashboard.tsx:174-178,220-222,507` | The query has no explicit polling/subscription. Replace “Live Data” and “Live Audit Stream” with honest fetched-data labels and an update time/refresh action unless actual live updates are implemented. Default query refetches are not a live connection. |
| Inventory mixes browsing and several management tasks | `pages/admin/Inventory.tsx:32-61` | Keep the item register primary; open item editing/receiving in focused forms or routes. Categories/suppliers should not compete with daily stock work. Preserve current API semantics. |

## Minor findings

- Navigation text is 12px (`workspace.css:22,29`), with several 10–11px captions. Increase frequent-use labels to 13–14px; reserve small type for metadata. This is a readability recommendation, not an automatic WCAG failure.
- The page finder has clickable links but no custom result keyboard model (`WorkspaceShell.tsx:118`). Add predictable dismissal/focus behavior. Keep its accurate “Find a page” label; it does not search business records.
- `PageHeader` exists, but Staff and Dashboard implement their own header structures. Reuse a small number of intentional templates instead of hand-copying them.
- Vite reported a main JS asset of 1,495.28 kB minified / 421.31 kB gzip and a large-chunk warning. Routes in `App.tsx` are eagerly imported. Evaluate route-level splitting and export/PDF-on-demand loading. Bundle size is measured; slow user experience has not been measured.
- Build warnings include deprecated esbuild options from the Vite React plugin and an ineffective dynamic import of the already-static API module. Track these separately from the visual redesign.
- README module status is stale relative to the operational Inventory/Finance routes. Verify capability from current code and tests before marking screens as planned or complete.

## What is already good

- Shared desktop/mobile navigation comes from one permission-filtered definition.
- The mobile drawer uses Radix, restores focus, dismisses with Escape, and has regression coverage.
- The shell includes a skip link, labeled controls, and selected-route semantics.
- Runtime product naming, locally loaded Inter, Lucide icons, and existing UI primitives provide a usable foundation.
- Shared CRM stage/status metadata keeps business vocabulary consistent.
- Existing tests cover seven role configurations, direct navigation, production preview behavior, operational screen rendering, and a mocked sale flow.

## Test gaps

Passing tests do not establish visual consistency, accessibility conformance, deployed credential safety, or complete business workflow correctness. Add coverage for:

1. Dialog focus containment/restoration and dirty-form dismissal.
2. Exclusive loading/error/empty/filtered-empty states, including retries.
3. Table filters/sorting/pagination and preservation after editing a record.
4. Keyboard page-finder behavior and mobile access to the same navigation capability.
5. Zoom/reflow, long names, large INR values, and non-color status identification.
6. Read-only and denied mutation behavior, backed by real API authorization tests separately.
7. Preview-disabled production login, after the demo separation decision.

## Open decisions

- Is the target deployment a public sample-data demo or a private real-data ERP?
- Which three screens do staff use most, and at what typical record counts?
- Do staff mainly work on desktop, shared tablets, or phones?
- Is MarvelSoftware the intended product identity or a configurable customer brand?

The linked design assumes a desktop-first operational ERP with mobile self-service and a light default theme. These are proposed defaults, not user-validated requirements.

## Verdict

Comment: retain the frontend stack and improve it incrementally. Address demo/production separation before a real-data release; address dialog behavior and state handling before spending effort on cosmetic polish.
