# ERP UI/UX design specification

Status: proposed design, 2026-11-27. No redesigned screens have been implemented or user-tested.

Related: [code-backed audit](./ui-ux-audit.md), [frontend implementation plan](./frontend-design.md).

## 1. Design direction

Use a restrained, light enterprise workspace: pale slate canvas, white working surfaces, blue actions, readable tables, and consistent spacing. Keep the existing light navigation rather than reintroducing the older dark screenshot style.

A professional ERP should let a person quickly answer: Where am I? What needs my attention? What will this action do? Did the system save it?

Prioritize those answers over gradients, large welcome banners, rainbow metric cards, or marketing-style copy. Use business labels such as “Payroll” and “Recent activity” instead of “Payroll Engine” and “Live Audit Stream”.

## 2. Where to find good references

Use a small reference set. Borrow interaction patterns rather than mixing several entire visual systems.

| Reference | What to study | How to apply here |
| --- | --- | --- |
| [IBM Carbon data table guidance](https://carbondesignsystem.com/components/data-table/usage/) | Table toolbars, selection, batch actions, expansion, and pagination | Primary reference for ERP registers. Follow the behavior principles without installing Carbon. |
| [shadcn-admin](https://github.com/satnaing/shadcn-admin) | React admin shell, settings, navigation, and list composition | Existing project shortlist recommends it. Use as a layout reference, not a replacement application. |
| [shadcn/ui](https://ui.shadcn.com/) | Editable component composition and restrained styling | The app already has compatible concepts through local components and Radix. Check exact Tailwind/React compatibility before copying current source. |
| [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) | Modal keyboard behavior, focus containment, title/description, return focus | Use the installed primitive through a shared local wrapper. |
| [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) | Contrast, keyboard access, focus visibility, reflow, errors, target size | Acceptance criteria for implementation, not a claim that the current app conforms. |

Carbon and WCAG pages were retrieved during this review; Radix behavior was checked through current Context7 documentation. The repository's `admin-ui-reuse.md` supplies the template shortlist; those repositories were not independently re-audited here. Verify licensing and version compatibility before copying code or assets. Dribbble/Behance can help collect visual ideas, but a single polished dashboard image does not establish a complete ERP workflow.

For design work, make a small Figma/Penpot board covering a shell, a dense register, a form, a record detail, and every feedback state. A dashboard alone is not enough.

## 3. Layout and navigation

### Shared shell

- Desktop sidebar: retain 272px as the initial target. Header: approximately 64px, allowed to grow for zoom and wrapping.
- Desktop content padding: 24–32px; mobile: 16px. Standard page sections: 24px apart.
- Retain the current 1280px content maximum for ordinary pages initially; evaluate a wider register layout only on genuinely column-heavy screens.
- Keep the existing sidebar-to-drawer breakpoint at 1024px. Do not introduce another competing 900px shell breakpoint.
- Keep company/product identity at the top and the user's identity at the bottom. Do not imply multi-company switching when the app only supports one company.
- Breadcrumbs describe location. Page titles describe the task or register. Put the page's primary action beside its title.
- Use the current permission-aware groups initially. Test whether the long “People & access” group should later split into People and Access administration; do not change routes and grouping during initial component standardization.
- Retain clear selected states and expanded-group semantics. Use one navigation vocabulary everywhere.

### Header controls

Keep “Find a page” as navigation search. Do not call it global search unless it searches permission-filtered records with a supporting API. Do not show a keyboard-shortcut badge before implementing that shortcut.

Put profile, change password, and sign-out in a consistent user menu if reducing header clutter. A notification bell requires a real notification source; omit decorative nonfunctional controls.

### Register wireframe

```text
[Sidebar] | [Breadcrumb]                     [Find a page] [Account]
          | Customers                             [+ Add customer]
          | Customer records and contact history
          |
          | [Search by name or phone] [Status] [Filters]   [Export]
          | [Active filter chips]                         [Clear]
          | Customer       Phone          Status       Last activity
          | Name / code    Contact        Active       Date       …
          | ...
          | 1–25 of N records                       [Previous] [Next]
```

`N` and all rows come from real data. A mockup may use clearly labeled synthetic fixtures, never present them as live business totals.

## 4. Visual system

These are proposed semantic targets, not measured accessibility results. Validate actual rendered color pairs before release.

| Token | Target | Use |
| --- | --- | --- |
| Canvas | `#F8FAFC` | App background/sidebar |
| Surface | `#FFFFFF` | Forms, tables, panels |
| Surface subtle | `#F1F5F9` | Grouping and hover areas |
| Text primary | `#0F172A` | Titles and record values |
| Text secondary | `#475569` | Supporting copy |
| Text muted | `#64748B` | Metadata |
| Border subtle | `#E2E8F0` | Decorative separators |
| Control border | `#64748B` | Where a boundary identifies an input/control |
| Primary | `#2563EB` | Main action and links |
| Primary hover | `#1D4ED8` | Hover/pressed emphasis |
| Selection | `#EFF6FF` with `#1D4ED8` text | Selected light surfaces |
| Success | `#166534` on `#F0FDF4` | Completed/approved |
| Warning | `#92400E` on `#FFFBEB` | Pending/attention |
| Danger | `#B91C1C` on `#FEF2F2` | Failed/destructive |

Do not use the decorative border token as the sole visual identifier of an essential control unless the complete treatment meets non-text contrast requirements. Status indicators include words; color is supplemental.

Typography:

- Inter remains the application font. Body/form/table text: 14px, approximately 20–22px line height.
- Navigation: 13–14px. Secondary metadata: 12px. Avoid essential instructions at 10–11px.
- Page title: 24px/32px, weight 600–700. Section title: 16px/24px. Metric value: 28px/34px.
- Use tabular numerals for financial values, counts, dates, and codes where alignment matters.
- Reserve uppercase for occasional short section captions; table headings can use sentence case.

Spacing uses a 4px base: 4, 8, 12, 16, 24, 32, 48. Cards use 12px corners; controls use 8px. Prefer borders and minimal shadows over stacked elevated cards. Use Lucide consistently at 16px in controls and 18–20px in navigation.

Default controls should be 40px high; touch-oriented controls should aim for 44px. Table rows target 48px, with an optional 40px compact desktop density after testing. Avoid changing density arbitrarily between modules.

## 5. Tables and search

- Use one toolbar pattern: local search, useful filters, optional columns, and clearly scoped export.
- Give every table a caption or accessible name, header associations, and an explicit row action label.
- Left-align text, right-align monetary amounts and quantities. Keep currency precision consistent with accounting rules.
- Keep the identity column stable. Use names plus secondary record codes rather than a wall of IDs.
- Use an explicit record link. Do not make row-click the only way to open a record.
- Show an active sort indicator; sortable headers are keyboard-operable buttons with `aria-sort` on the header.
- Apply filtering and sorting to the full dataset through supported server queries, not just a fetched page. If only page-local behavior is available, label it honestly or defer it.
- Use “No customers yet” with an allowed create action for true emptiness. Use “No matching customers” with Clear filters for filtered emptiness.
- Pagination shows the true total and current range when supplied by the API. Keep the current page/filter context after an edit.
- Export must explain whether it includes the current page, selected rows, or all filtered results. Apply the same permissions as on-screen data.
- Add selection/bulk actions only when the business operation and API support them. Explain partial failures and scope.

## 6. Forms and record detail

Use dialogs for short, focused actions. Use a detail page or side panel for record inspection. Long customer/employee forms and multi-step sales/payroll work deserve enough space to review their consequences.

- Provide persistent labels, required-field conventions, helpful examples, inline errors, and an error summary for long forms.
- Connect hint/error text with `aria-describedby`; invalid fields expose `aria-invalid`.
- Validate without wiping user input. Focus the first invalid field after submission.
- Give each form one clear primary action. Use specific verbs: “Save employee”, “Receive stock”, “Approve leave”.
- Disable duplicate submissions and show “Saving…” while pending. Do not announce success until the server confirms it.
- Warn before dismissing dirty forms. Important financial actions show a review step, totals, and the exact operation to confirm.
- Modal focus stays inside, Escape follows the dirty/pending policy, and closing restores focus. Use accessible dialog titles/descriptions.
- Keep sensitive payroll/bank fields out of general-purpose lists; use permission checks and deliberate reveal behavior where needed.
- Show audit/history where the API supports it. Do not invent approval stages or imply audit coverage that has not been verified.

## 7. Screen priorities

| Area | Target experience |
| --- | --- |
| Dashboard | Four role-relevant metrics followed immediately by work needing attention. Recent activity is secondary. No invented trends or live-connection claims. |
| Staff/access | Consistent user register; clear separation between login accounts and employee records. Permission changes identify scope and save outcome. |
| Employees | Searchable directory, employment status filters, readable details, focused edit form, controlled sensitive fields. |
| Attendance | Date/period selection, exceptions first, unambiguous import result and correction path. Do not confuse missing data with absence. |
| Leave | Pending queue, employee/date/balance context where authorized, reason capture for rejection, clear status after mutation. |
| Payroll | Period and run status remain visible; review totals before irreversible operations; retain existing server transition rules. |
| CRM | Preserve lead stages and board/table choice. Make owner and next follow-up easy to scan. Preserve context during conversion/detail edits. |
| Sales/invoices | Preserve draft/reservation/payment/finalization flow. Show line values, tax, total, and payment state clearly. Avoid premature “paid” messaging. |
| Inventory | Item register first, focused receive/edit actions, clear distinction between on-hand, reserved, and available quantities. |
| Finance | Clear register dates, amounts, references, and posting state. Never infer posted/paid from color alone. |
| Settings | Group related settings and provide local save feedback; guard unsaved navigation. Retain runtime branding. |
| Employee portal | Simple personal tasks and self-service. Do not expose administrative vocabulary or restricted information. |

Suggested dashboard order:

```text
Overview                        [Period, only if supported] [Refresh]
[Metric] [Metric] [Metric] [Metric]
[Needs attention / approvals]    [Recent activity]
[Role-specific work list]
```

Only show attention queues backed by current endpoints. Adding a new aggregated queue requires a separate API decision; do not construct misleading totals from incomplete paginated data.

## 8. Feedback, accessibility, and responsive behavior

For each data region design: initial loading, populated, true empty, filtered empty, error/retry, refresh with existing data, and permission denied. Distinguish zero from unavailable. Keep stale data visibly marked when a refresh fails.

Target WCAG 2.2 AA: 4.5:1 contrast for ordinary text, 3:1 for large text and applicable non-text controls, visible/unobscured focus, keyboard access, and programmatic labels/errors. The 24 × 24 CSS-pixel minimum target criterion has spacing/exceptions; use 44px as a practical touch design target, not as a blanket AA requirement.

- At 390px, stack title/actions and form fields; keep the primary task visible.
- At 768px, allow selected two-column layouts only where labels and controls fit.
- At 1024px, use desktop navigation. Wide tables scroll inside their own named region, not the whole page.
- At 200% zoom and down to 320 CSS pixels, preserve content/actions; tables may need two-dimensional scrolling, but surrounding controls must reflow.
- Keep keyboard focus visible inside sticky headers, dialogs, and scroll regions. Honor reduced motion.
- Financial print/PDF layouts need a separate check; responsive web changes must not silently alter printed invoices or payslips.

## 9. Review checklist

- [ ] The same task uses the same label, component, and interaction across modules.
- [ ] A user can find the primary task without scrolling through decorative summaries.
- [ ] All relevant loading/error/empty/pending states have a deliberate design.
- [ ] Keyboard and touch users can finish the workflow.
- [ ] Dates, amounts, statuses, and permission boundaries remain accurate.
- [ ] Desktop and mobile screenshots use synthetic data and reflect current source.
- [ ] Representative staff can complete a lookup, edit, and approval without coaching; record completion time and errors before setting numeric improvement targets.
