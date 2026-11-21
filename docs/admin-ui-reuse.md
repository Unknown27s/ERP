# Admin UI reuse shortlist

Checked against GitHub on 2026-11-21. No template code was copied and no new dependency was installed.

| Project | License | Fit for this ERP |
| --- | --- | --- |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | MIT | Best layout reference: React/Vite admin navigation, responsive layouts, and settings screens. Adapt selected patterns, not its entire authentication or routing setup. |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | MIT | Useful editable UI components. This app already has Radix primitives, Lucide, and Tailwind; retain those rather than installing a second component stack. Check Tailwind version compatibility before importing current components. |
| [TanStack/table](https://github.com/TanStack/table) | MIT | Candidate for sorting, filtering, column visibility, and pagination in staff, inventory, and sales tables. Not needed just to restyle the sidebar. |

The mobile navigation uses the existing Radix Dialog dependency for focus trapping, Escape/outside-click dismissal, and focus restoration. Desktop and mobile share the same permission-filtered navigation definition.

## Production demo login

The login page deliberately shows demo role shortcuts in production builds as well as development. It prefers the server-configured preview roster when available and otherwise shows the four existing seeded role shortcuts. A shortcut fills the normal login form; it does not bypass server authentication or RBAC. Accounts must already exist in the target database with matching credentials. This UI change does not create users or run seeds.

These are shared credentials, including an administrator account with full access. The current implementation does not isolate demo users from real data: deploy against sample data only, or isolate the demo tenant/database before collecting confidential information. A production build is not itself a data-isolation boundary.

## UI verification

Run `npm run build`, then `npx playwright test --config playwright.sidebar.config.ts`. The 16 checks run against a production preview with mocked API responses (no real staff data or credentials are sent). They cover desktop styling and Inter, direct-route selection, mobile dismissal/focus/navigation, seven-role navigation, production demo shortcuts and runtime preview accounts, operational screens, and sales checkout. They do not verify that demo accounts exist in a deployed database.
