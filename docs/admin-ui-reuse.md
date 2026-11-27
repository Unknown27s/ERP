# Admin UI reuse shortlist

Checked against GitHub on 2026-11-21. No template code was copied and no new dependency was installed.

| Project | License | Fit for this ERP |
| --- | --- | --- |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | MIT | Best layout reference: React/Vite admin navigation, responsive layouts, and settings screens. Adapt selected patterns, not its entire authentication or routing setup. |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | MIT | Useful editable UI components. This app already has Radix primitives, Lucide, and Tailwind; retain those rather than installing a second component stack. Check Tailwind version compatibility before importing current components. |
| [TanStack/table](https://github.com/TanStack/table) | MIT | Candidate for sorting, filtering, column visibility, and pagination in staff, inventory, and sales tables. Not needed just to restyle the sidebar. |

The mobile navigation uses the existing Radix Dialog dependency for focus trapping, Escape/outside-click dismissal, and focus restoration. Desktop and mobile share the same permission-filtered navigation definition.

## Production demo login

The login page lists every seeded demo person returned by `GET /api/config`, with their name, role, email, and password. The server roster is on by default, including production builds; it is limited to the fixed demo mailbox allowlist and each password is verified against the stored bcrypt hash before being returned. Set `PREVIEW_LOGIN=0` to disable the roster. A card fills the normal login form; it does not bypass server authentication or RBAC. Accounts must already exist in the target database with matching credentials. This UI does not create users or run seeds.

These are shared credentials, including an administrator account with full access. The implementation does not isolate demo users from real data: deploy against sample data only, or isolate the demo tenant/database before collecting confidential information. A production build is not itself a data-isolation boundary.

## UI verification

Run `npm run build`, then `npx playwright test --config playwright.sidebar.config.ts`. The 29 checks run against a production preview with mocked API responses (no real staff data or credentials are sent). They cover desktop styling and Inter, direct-route selection, mobile dismissal/focus/navigation, seven-role navigation, the demo roster, task assignment and completion, reports, operational screens, and sales checkout. They do not verify that demo accounts exist in a deployed database.
