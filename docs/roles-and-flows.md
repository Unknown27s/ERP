# ERP Roles and Flow Specification (Employee to CEO)

A build reference for a web-based ERP: roles, who assigns them, what each role can do, and how requests, approvals and evaluations flow. Written so each section can be turned into database tables, permission settings and workflow rules.

Items marked **(Suggested)** are defaults to adjust (limits, weights, time periods). Items marked **(Industry practice)** reflect what ERP and HR system documentation commonly describes.

---

## 1. Design rules

| Rule | Implementation note |
|---|---|
| Role-based access (RBAC) | Permissions attach to roles. Users get one or more roles. A user with no role has no access. |
| Least privilege | Each role holds only what the job needs. |
| Segregation of duties (SoD) | The same user must not request, approve, record and pay the same item. Enforce in role design and workflow routing, not only in reporting lines. |
| Approval by risk tier | Use an approval matrix with amount limits, per request type. |
| Audit trail | Log every create, update, approve, reject, return and role change with user, time and old/new value. No hard deletes on business records. |
| Access review | Review on join, move, exit, and on a fixed schedule. |
| Several small roles over one complex role | When a user holds overlapping roles, the most permissive access wins, so check combinations. |
| Baseline access | Every employee gets a baseline role (own profile, payslip, leave, directory). Job access is added from HR data such as department and cost centre. |

---

## 2. Roles

### 2.1 Role list

| Code | Role | Role given by | Applied by |
|---|---|---|---|
| EMP | Employee | HR creates profile | IT / ERP admin (standard template) |
| TL | Team lead / supervisor | Department manager requests, HR validates | IT / ERP admin |
| DM | Department manager / reviewing manager | Head of department or HR head requests; CEO approves for senior positions **(Suggested)** | IT / ERP admin |
| HOD | Head of department | CEO | IT / ERP admin |
| HR | HR head / HR administrator | CEO or board | IT / ERP admin |
| FIN | Finance head / finance team | CEO approves | IT / ERP admin |
| ADM | IT / ERP administrator | Set at implementation; CEO authorizes the super admin | Super admin |
| CEO | CEO | Board or owners | Super admin |

### 2.2 Role details

**EMP: Employee**
- Does: performs assigned work, updates task progress, raises requests (leave, expense, purchase) within own limit, views own payslip, attendance and ratings, completes self-evaluation.
- Sees: own data only.
- Cannot: approve anything, see others' pay or ratings, change roles.
- Evaluated on: target completion, quality, attendance, teamwork, learning.

**TL: Team lead**
- Does: allocates and tracks daily work, first review of team requests, scores each team member, gives feedback, recommends training or promotion.
- Sees: team tasks, attendance, requests, evaluations.
- Cannot: approve own requests, change team pay.
- Evaluated on: team output, deadlines met, quality of team ratings, team retention.

**DM: Department manager**
- Does: owns department goals, budget and headcount; approves second-level requests; reviews team lead evaluations (manager's manager step); raises role requests for hires and promotions.
- Sees: department reports, budget usage, all team evaluations.
- Cannot: approve above own limit or approve requests they raised.
- Evaluated on: department targets, budget control, staff retention.

**HOD: Head of department**
- Does: reviews evaluations forwarded by managers, approves departmental plans, forwards final evaluations to HR for audit.
- Evaluated on: departmental results across the year.

**HR: HR head / HR administrator**
- Does: maintains employee records, hiring, onboarding, attendance and leave policy, payroll inputs. The HR administrator defines appraisal forms, schedule and weights, starts the appraisal cycle, ensures completion, and does the final audit of evaluations. Starts role requests.
- Cannot: approve own pay or role changes.
- Evaluated on: time to hire, attrition, appraisal completion rate, policy compliance.

**FIN: Finance head / finance team**
- Does: checks budgets, approves expenses and purchases above department limits, manages accounts and payment release, prepares reports for the CEO.
- Key control: the person who creates a vendor or invoice must not approve the payment.
- Evaluated on: budget accuracy, audit findings, timely period closing.

**ADM: IT / ERP administrator**
- Does: creates users, defines roles and permissions, resets access, removes access on exit, manages audit logs, security and backups.
- Cannot: approve business transactions or evaluate employees.
- Evaluated on: uptime, access error rate, security incidents, speed of access requests.

**CEO**
- Does: final approval for promotions, senior hires, large expenses and policy changes; authorizes sensitive roles; views company-wide dashboards (cost, headcount, pending approvals).
- Evaluated by: board or owners on company results.

### 2.3 Reporting hierarchy

```
CEO
├── Head of department
│   └── Department manager
│       └── Team lead
│           └── Employee
├── Finance head
└── HR head

IT / ERP admin: assigns system roles to all levels (outside the business reporting line)
```

### 2.4 Permission matrix (Suggested)

Codes: V = view, C = create, E = edit, A = approve, R = report/export, X = no access, "own" = own records only, "team" = own team, "dept" = own department.

| Module / function | EMP | TL | DM | HOD | HR | FIN | ADM | CEO |
|---|---|---|---|---|---|---|---|---|
| Own profile, payslip, leave balance | V, E (limited) | V | V | V | V | V | V | V |
| Leave requests | C own | V, A team | V, A dept | V | V, E | X | X | V |
| Expense / purchase requests | C own | V, A team | V, A dept (limit) | V | X | V, A (limit) | X | A (high value) |
| Employee records | X | V team | V dept | V dept | V, C, E | X | X | V |
| Payroll | V own | X | X | X | C, E inputs | V, A, pay | X | V |
| Vendor master and payments | X | X | V dept | X | X | C, E, A (separate users for create and pay) | X | V |
| Appraisal forms and cycle setup | X | X | X | X | C, E | X | X | V |
| Appraisal scoring | self only | C, E team | A, review | A, forward | Audit | X | X | A (promotion) |
| Role and user management | X | X | request | X | request | X | C, E, A | Authorize sensitive |
| Audit log | X | X | X | X | V (HR items) | V (finance items) | V all | V all |
| Company dashboards | X | team | dept | dept | HR KPIs | finance KPIs | system health | V all |
| System settings, backup, security | X | X | X | X | X | X | C, E | V |

---

## 3. Role assignment flow

Steps:

1. **Trigger:** hire, transfer or promotion is decided (department manager and HR).
2. **Profile:** HR creates the employee profile: name, department, designation, reporting manager, cost centre, joining date.
3. **Role request:** department manager raises a request naming the role template needed.
4. **Validation:** HR confirms the person is employed and the role fits the position.
5. **Sensitive role check:** for finance, payroll and admin roles, the CEO or Finance head approves **(Suggested)**.
6. **Provisioning:** IT / ERP admin creates the login and applies the role template with approval limits.
7. **First login:** employee sets a password and enables MFA (mandatory for admin and finance).
8. **Review:** periodic access review. On role change or exit, a new role request or access removal starts at step 3.

Controls:
- The requester never provisions the role.
- The IT admin never approves business requests.
- Every step writes an audit record.

Request statuses: `draft`, `submitted`, `hr_validated`, `pending_sensitive_approval`, `provisioned`, `active`, `rejected`, `revoked`.

---

## 4. Approval flow

### 4.1 Standard path

1. Employee submits a request.
2. Team lead reviews: approve, or return with comments.
3. Department manager approves if within limit; otherwise routes up.
4. Finance or HR head verifies and approves within their limit; routes up above it.
5. CEO gives final approval above the CEO threshold.
6. On final approval the record is locked and posted to the relevant module (payroll, accounts, inventory).

Any approver can approve, reject, or return for correction. A return goes back to the requester and restarts routing.

### 4.2 Approval matrix (Suggested)

| Request type | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|
| Leave | Team lead | Department manager (long leave) | n/a | n/a |
| Expense up to 10,000 | Team lead | Department manager | n/a | n/a |
| Purchase 10,000 to 100,000 | Team lead | Department manager | Finance head | n/a |
| Purchase above 100,000 | Team lead | Department manager | Finance head | CEO |
| New hire | Department manager | HR head | Finance head | CEO (senior roles) |
| Promotion or role change | Team lead | Department manager | HR head | CEO |
| Privileged role (finance, admin) | HR head | IT admin | n/a | CEO |

### 4.3 Workflow rules

- **Delegation:** an approver on leave names a backup; routing uses the backup for that period.
- **Escalation:** no action within a set time (for example 48 hours) moves the request up one level.
- **No self-approval:** a user never approves their own request, even if their role allows approval.
- **Chain-wide SoD:** check the whole chain, not only reporting lines. A manager must not approve vendor setup, purchase and payment for the same item.
- **Limits by role and type:** limits are stored per role and per request type, centrally governed, configurable by department.

Request statuses: `draft`, `submitted`, `pending_L1`, `pending_L2`, `pending_L3`, `pending_CEO`, `returned`, `approved`, `rejected`, `posted`, `cancelled`.

---

## 5. Evaluation flow

### 5.1 Participants (Industry practice)

Common participants: employee, manager/supervisor, reviewer (second-level manager), head of department, HR, and others (project managers, dotted-line managers). Three-step flows are usually employee, manager, reviewer; four-step flows add the department head or HR.

### 5.2 Cycle

| Step | Owner | Action |
|---|---|---|
| 1. Goals set | Employee and team lead | Targets agreed at start of period |
| 2. Check-ins | Team lead | Monthly or quarterly progress notes |
| 3. Appraisal started | HR administrator | Forms and schedule released |
| 4. Self-evaluation | Employee | Self-rating and comments |
| 5. Manager evaluation | Team lead / manager | Scores, comments, development needs |
| 6. Upline review | Manager's manager / reviewer | Approve, or send back for changes |
| 7. HR audit | HR | Final consistency check |
| 8. Review meeting | Manager and employee | Discuss ratings and next goals |
| 9. Acknowledgment | Employee | Accept or contest; record then locked |
| 10. Decision | HR, department head, CEO | Increment, promotion, training or improvement plan |
| 11. Role update | IT admin | New role applied if position changed (back to section 3, step 3) |

Appraisal statuses: `goals_set`, `self_eval_pending`, `manager_eval_pending`, `reviewer_pending`, `hr_audit`, `meeting`, `acknowledged`, `contested`, `decided`, `locked`.

### 5.3 Scoring model (Suggested)

| Criteria | Weight | Scored by |
|---|---|---|
| Task completion and targets | 40% | Team lead |
| Quality of work | 20% | Team lead |
| Attendance and punctuality | 10% | System (from HR data) |
| Teamwork and communication | 15% | Team lead and peers |
| Skills and learning | 15% | Department manager |

Rating bands (1 to 5): 4 and above, eligible for promotion or bonus; 3, normal increment; below 3, training or improvement plan. HR defines final weights and bands per appraisal form.

---

## 6. Data flow (text)

1. HR creates the employee record: the source of truth for department, manager and position.
2. The role request goes to the IT admin, who writes the role and permissions to the access store.
3. When a user acts in the ERP, the backend checks identity, then role, then approval limit.
4. The workflow engine reads the approval matrix and routes to the correct approver.
5. Each action is saved to the main database and the audit log.
6. Notifications go to the next approver and the requester.
7. Approved records post to the relevant module (payroll, accounts, inventory).
8. Appraisal scores flow from appraisal records to HR, then to the CEO dashboard.
9. Dashboards and reports are filtered by role, so each person sees only their scope.

---

## 7. Suggested data entities (for integration)

| Entity | Key fields |
|---|---|
| `employee` | id, name, department_id, designation, manager_id, cost_centre, join_date, status |
| `user` | id, employee_id, login, mfa_enabled, status, last_login |
| `role` | id, code, name, description, is_sensitive |
| `permission` | id, module, action (view, create, edit, approve, report), scope (own, team, dept, all) |
| `role_permission` | role_id, permission_id |
| `user_role` | user_id, role_id, granted_by, granted_at, revoked_at |
| `role_request` | id, employee_id, role_id, requested_by, status, hr_validated_by, sensitive_approved_by, provisioned_by |
| `approval_rule` | id, request_type, min_amount, max_amount, level, approver_role_id, escalation_hours |
| `delegation` | id, approver_user_id, backup_user_id, start_date, end_date |
| `request` | id, type, requester_id, amount, status, current_level, created_at |
| `request_action` | id, request_id, actor_id, action (approve, reject, return), comment, acted_at |
| `appraisal_form` | id, name, sections, weights, schedule |
| `appraisal` | id, employee_id, period, form_id, status, final_rating |
| `appraisal_score` | appraisal_id, criterion, scored_by, score, comment |
| `audit_log` | id, user_id, entity, entity_id, action, old_value, new_value, timestamp |
| `notification` | id, user_id, event, channel (email, in-app), sent_at, read_at |

Key integration points: HR employee records to user provisioning; approval rules to the workflow engine; request approvals to payroll, accounts and inventory posting; appraisal ratings to promotion decisions and role requests.

---

## 8. Validation checklist

- [ ] Every role has a written job description and access list.
- [ ] Incompatible duties are listed and blocked (request and approve, create vendor and pay vendor).
- [ ] The requester of a role cannot provision it; the IT admin cannot approve business requests.
- [ ] Approval matrix signed off by finance and the CEO.
- [ ] Delegation and escalation configured and tested.
- [ ] No self-approval at any level.
- [ ] Access review schedule agreed (join, move, exit, periodic).
- [ ] Appraisal forms, weights and calendar approved by HR.
- [ ] MFA enabled for all users, mandatory for admin and finance.
- [ ] Audit log records every action and role change.

---

## 9. Sources consulted

- Visma.net ERP help, role-based access: https://help.visma.net/gb_en/financials/online-help/shared-files/sm-role-based-access-con.html
- Sage setup guidance on users and role-based access: https://www.cleverence.com/articles/sage-documentation/set-up-company-users-passwords-and-user-roles-9274
- Oracle ERP security roles and access reviews: https://www.hyperbots.com/glossary/oracle-erp-security-roles
- Oracle ERP security, birthright and job-based access: https://www.cleverence.com/articles/oracle-documentation/7-managing-users-and-security-4382/
- Cloud ERP RBAC guide: https://www.alzerp.com/kb/cloud-erp-role-based-access-control-rbac-guide-2025
- ERP segregation of duties: https://www.hyperbots.com/glossary/erp-segregation-of-duties
- Finance ERP approval workflow design: https://sysgenpro.com/industries/finance-erp-best-practices-for-standardizing-approvals-and-operational-reporting
- Finance ERP workflow design for segregation of duties: https://sysgenpro.com/automation/finance-erp-workflow-design-for-segregation-of-duties-and-approval-compliance
- Performance review stakeholders and steps: https://empxtrack.com/?p=10726
- Oracle JD Edwards appraisal approval routing: https://docs.oracle.com/en/applications/jd-edwards/human-capital/9.2/eoahr/performance-appraisals-by-managers.html
- Infor performance appraisal cycle and roles: https://docs.infor.com/ghrtm/2023.x/en-us/ghrtmolh/ghrtmperfug/shx1488915690154.html
- SHRM performance appraisal timeline: https://shrm.org/topics-tools/tools/forms/performance-appraisal-timeline
