# Role-aware sign-in and assigned work

Status: implementation scope agreed through the user's request, 2026-11-27.

## Experience

- An explicitly enabled preview sign-in screen lists the configured demo people by name, email, and actual role. Picking a person fills the regular login form. Authentication and permissions remain server-authoritative.
- No fallback credentials or staff directory are published when preview is disabled. The existing seven-person server preview roster remains the default; additional demo accounts require the existing explicit allowlist/password configuration. Never discover or expose every production user publicly.
- People holding `hr.manage` (default Administrator, Manager, HR) can assign work to active login accounts in their company and inspect team progress. This reuses an existing personnel-management permission; no automatic permission grants are added.
- Every authenticated person can open My tasks, including people without a linked employee/HR record. Only the assignee can update their task's progress.
- Tasks move Assigned (`pending`) -> In progress -> Completed, or In progress -> Blocked -> In progress. Blocked work requires a note. Completion does not imply manager approval, payroll time, or a financial posting.
- Existing timed employee work logs remain separate and reachable. Assigned tasks must not fabricate worked hours or alter historical reports.

## Backend and data

New migration `0016_task_assignments_pg.sql` adds company-scoped assignments with assignee, creator, optional date-only due date, status, progress note, completion timestamp, and concurrency version. No existing records are rewritten.

Endpoints:

- `GET /api/tasks?scope=mine|team&status=...&q=...&page=...`: authenticated, own rows by default; team scope requires `hr.manage`. Bounded pagination and matching count.
- `GET /api/tasks/assignees`: `hr.manage`, returns only active same-company account identifiers/names/roles for assigning work.
- `POST /api/tasks`: `hr.manage`, validates title/description/due date and active same-company assignee; records assignment and audit entry atomically.
- `PATCH /api/tasks/:id/status`: authenticated assignee only; allowlisted fields, valid transition, expected version, required blocked note; update and audit entry atomically. Conflicting stale changes return 409.

## Security checkpoint

- Authentication, current permissions, company scoping, and ownership enforced on every endpoint.
- Parameterized SQL, bounded text and pagination, validated real calendar dates, enumerated statuses. No password hashes, personal bank fields, or contact directory in task responses.
- Task text rendered as React text, not HTML. No file uploads or rich text added.
- Preview retains existing explicit server allowlist and credential verification. Production sign-in has no client-side default credentials.
- No live database seeds or migrations run by the agent. The new migration runs through the application's existing migration-on-start process when deployed/restarted.

## Acceptance

1. Manager assigns to an active same-company person; task appears in that person's My tasks.
2. Assignee starts, blocks/resumes, and completes it; team view reflects refreshed status.
3. Another employee cannot view/update it or assign tasks. Cross-company/inactive targets are rejected.
4. Invalid status, invalid date, overlong text, and stale version return controlled errors without changes.
5. All configured preview roles render; disabled preview renders no people or credentials.
6. Automated browser tests cover UI actions and states; isolated Postgres API tests cover authorization, persistence, transitions, concurrency, and auditing.
