/**
 * Phase 1 acceptance tests — permissions and the audit trail.
 *
 * Requires DATABASE_URL (Postgres). Fixtures use a dedicated throwaway shop and
 * are removed in `after`, so the suite can run against a shared test database.
 *
 * Acceptance criteria exercised here:
 *  1. A user without a permission receives HTTP 403 from the API.
 *  2. Role changes take effect on the very next request (no re-login).
 *  3. The audit log records who changed what.
 *  4. Business records (departments, designations, holidays) are deactivated,
 *     never hard-deleted.
 *  5. Company identity lives in settings, not in code.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  throw new Error('Missing DATABASE_URL for tests. Set it to your Supabase/test Postgres connection string.');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32chars-minimum-xxxxxx';
process.env.MAIL_DISABLED = 'true';

const app = require('../src/index');
const { get, run, uid, closeDb } = require('../src/db');
const { ensureRbac } = require('../src/services/rbac');

const runId = Date.now().toString(36);
let base = '';
let srv = null;
let shopId = '';
let adminId = '';
let employeeId = '';
let financeId = '';
let adminTok = '';
let employeeTok = '';
let financeTok = '';
let employeeRoleId = '';

const adminEmail = `foundation_admin_${runId}@test.local`;
const employeeEmail = `foundation_emp_${runId}@test.local`;
const financeEmail = `foundation_fin_${runId}@test.local`;
const PASSWORD = 'Password@123';

async function api(method, path, token, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

async function mkUser(email, roleName) {
  const role = await get('SELECT id, name FROM roles WHERE shop_id = ? AND name = ?', shopId, roleName);
  assert.ok(role, `seeded role ${roleName} must exist`);
  const id = uid('usr');
  await run(
    `INSERT INTO profiles (user_id, shop_id, role, role_id, display_name, email, password_hash, active, is_primary)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    id, shopId, roleName === 'Administrator' ? 'admin' : 'staff', role.id, email, email,
    bcrypt.hashSync(PASSWORD, 10), roleName === 'Administrator' ? 1 : 0
  );
  return { id, roleId: role.id };
}

before(async () => {
  await app.ready;

  shopId = uid('shop');
  await run('INSERT INTO shops (id, name, timezone, currency) VALUES (?,?,?,?)', shopId, 'Foundation Test Co', 'Asia/Kolkata', 'INR');
  await ensureRbac(shopId);

  const admin = await mkUser(adminEmail, 'Administrator');
  const employee = await mkUser(employeeEmail, 'Employee');
  const finance = await mkUser(financeEmail, 'Finance');
  adminId = admin.id;
  employeeId = employee.id;
  financeId = finance.id;
  employeeRoleId = employee.roleId;

  srv = app.listen(0);
  base = `http://localhost:${srv.address().port}/api`;

  const a = await api('POST', '/auth/login', null, { email: adminEmail, password: PASSWORD });
  assert.equal(a.status, 200);
  adminTok = a.body.token;

  const e = await api('POST', '/auth/login', null, { email: employeeEmail, password: PASSWORD });
  assert.equal(e.status, 200);
  employeeTok = e.body.token;
  // The Employee role intentionally lacks payroll/hiring permissions.
  assert.ok(!e.body.user.permissions.includes('payroll.view'));

  const f = await api('POST', '/auth/login', null, { email: financeEmail, password: PASSWORD });
  assert.equal(f.status, 200);
  financeTok = f.body.token;
});

test('403: a role without a permission is blocked by the API', async () => {
  const staff = await api('GET', '/staff/users', employeeTok);
  assert.equal(staff.status, 403);
  assert.equal(staff.body.required, 'staff.view');

  const payroll = await api('GET', '/hr/payroll', employeeTok);
  assert.equal(payroll.status, 403);
  assert.equal(payroll.body.required, 'payroll.view');

  const settings = await api('GET', '/admin/settings', employeeTok);
  assert.equal(settings.status, 403);
  assert.equal(settings.body.required, 'company.manage');

  // Inherited supplier/sales reads are gated as well, not merely hidden.
  const suppliers = await api('GET', '/suppliers', employeeTok);
  assert.equal(suppliers.status, 403);
  const sales = await api('GET', '/sales', employeeTok);
  assert.equal(sales.status, 403);

  // Finance can read money but cannot manage people or edit company settings.
  const finStaff = await api('GET', '/staff/users', financeTok);
  assert.equal(finStaff.status, 403);
  const finSettings = await api('GET', '/admin/settings', financeTok);
  assert.equal(finSettings.status, 403);
  const finRevenue = await api('GET', '/dashboard', financeTok);
  assert.equal(finRevenue.status, 200);
  assert.equal(typeof finRevenue.body.data.revenue_month, 'number');
  assert.equal(finRevenue.body.data.headcount, null);

  // Administrator holds every permission.
  const adminStaff = await api('GET', '/staff/users', adminTok);
  assert.equal(adminStaff.status, 200);

  // The dashboard only exposes sections the caller may see.
  const dash = await api('GET', '/dashboard', employeeTok);
  assert.equal(dash.status, 200);
  assert.equal(typeof dash.body.data.headcount, 'number');
  assert.equal(dash.body.data.customers, null);
  assert.equal(dash.body.data.payroll_net, null);
});

test('role permission changes apply on the next request without re-login', async () => {
  const before = await api('GET', '/hr/payroll', employeeTok);
  assert.equal(before.status, 403);

  const grant = await api('PUT', `/staff/roles/${employeeRoleId}/permissions`, adminTok, {
    permissions: ['leave.view', 'hr.view', 'payroll.view'],
  });
  assert.equal(grant.status, 200);
  assert.deepEqual(grant.body.data.permissions.sort(), ['hr.view', 'leave.view', 'payroll.view'].sort());

  const after = await api('GET', '/hr/payroll', employeeTok);
  assert.equal(after.status, 200);

  const audit = await get(
    `SELECT action, summary FROM audit_logs WHERE actor_id = ? AND action = 'role.permissions' ORDER BY created_at DESC LIMIT 1`,
    adminId
  );
  assert.ok(audit, 'permission change must be audited');
  assert.match(audit.summary, /payroll\.view/);
});

test('deactivating a role revokes its permissions on the next request', async () => {
  const allowed = await api('GET', '/hr/employees', employeeTok);
  assert.equal(allowed.status, 200);

  const off = await api('PATCH', `/staff/roles/${employeeRoleId}`, adminTok, { active: false });
  assert.equal(off.status, 200);
  const denied = await api('GET', '/hr/employees', employeeTok);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.required, 'hr.view');

  const on = await api('PATCH', `/staff/roles/${employeeRoleId}`, adminTok, { active: true });
  assert.equal(on.status, 200);
  const restored = await api('GET', '/hr/employees', employeeTok);
  assert.equal(restored.status, 200);
});

test('audit log records who changed what', async () => {
  const name = `Operations ${runId}`;
  const created = await api('POST', '/staff/departments', adminTok, { name });
  assert.equal(created.status, 201);
  const deptId = created.body.data.id;

  const renamed = await api('PATCH', `/staff/departments/${deptId}`, adminTok, { name: `${name} renamed` });
  assert.equal(renamed.status, 200);

  const logs = await api('GET', `/audit-logs?q=${encodeURIComponent(name)}`, adminTok);
  assert.equal(logs.status, 200);
  const create = logs.body.data.find((r) => r.action === 'staff.department.create');
  assert.ok(create, 'department creation must appear in the audit trail');
  assert.equal(create.actor_email, adminEmail);
  assert.match(create.summary, new RegExp(name));

  const update = logs.body.data.find((r) => r.action === 'staff.department.update');
  assert.ok(update, 'department rename must appear in the audit trail');
  assert.equal(update.actor_email, adminEmail);

  // Employees cannot read the audit trail at all.
  const denied = await api('GET', '/audit-logs', employeeTok);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.required, 'audit.view');
});

test('departments, designations and holidays are deactivated, never hard-deleted', async () => {
  const deptName = `Logistics ${runId}`;
  const dept = await api('POST', '/staff/departments', adminTok, { name: deptName });
  assert.equal(dept.status, 201);
  const deptId = dept.body.data.id;

  const deactivated = await api('PATCH', `/staff/departments/${deptId}`, adminTok, { active: false });
  assert.equal(deactivated.status, 200);
  const deptRow = await get('SELECT active FROM departments WHERE id = ?', deptId);
  assert.ok(deptRow, 'department row must still exist');
  assert.equal(deptRow.active, 0);

  const desig = await api('POST', '/staff/designations', adminTok, { name: `Supervisor ${runId}`, grade: 'M1' });
  assert.equal(desig.status, 201);
  const delDesig = await api('DELETE', `/hr/designations/${desig.body.data.id}`, adminTok);
  assert.equal(delDesig.status, 200);
  assert.equal(delDesig.body.data.deactivated, true);
  const desigRow = await get('SELECT active FROM designations WHERE id = ?', desig.body.data.id);
  assert.ok(desigRow, 'designation row must still exist');
  assert.equal(desigRow.active, 0);

  const holiday = await api('POST', '/hr/holidays', adminTok, { holiday_date: '2030-01-01', name: `Foundation Day ${runId}` });
  assert.equal(holiday.status, 201);
  const delHoliday = await api('DELETE', `/hr/holidays/${holiday.body.data.id}`, adminTok);
  assert.equal(delHoliday.status, 200);
  const holidayRow = await get('SELECT active FROM holidays WHERE id = ?', holiday.body.data.id);
  assert.ok(holidayRow, 'holiday row must still exist');
  assert.equal(holidayRow.active, 0);
});

test('company identity is stored in settings and audited', async () => {
  const current = await api('GET', '/admin/settings', adminTok);
  assert.equal(current.status, 200);
  assert.equal(current.body.data.currency, 'INR');
  assert.ok(current.body.data.product_name);

  const productName = `Foundation ERP ${runId}`;
  const saved = await api('PUT', '/admin/settings', adminTok, { product_name: productName });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.product_name, productName);

  const stored = await get('SELECT value FROM shop_settings WHERE shop_id = ? AND key = ?', shopId, 'product_name');
  assert.equal(stored.value, productName);

  const audit = await get(
    `SELECT action, summary FROM audit_logs WHERE actor_id = ? AND action = 'settings.update' ORDER BY created_at DESC LIMIT 1`,
    adminId
  );
  assert.ok(audit, 'settings change must be audited');
  assert.match(audit.summary, /product_name/);
});

after(async () => {
  if (srv) {
    const closed = new Promise((resolve) => srv.close(resolve));
    // Undici keeps keep-alive sockets open; drop them so the test process exits.
    if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
    await closed;
  }
  if (shopId) {
    const cleanup = [
      `DELETE FROM audit_logs WHERE actor_id IN (SELECT user_id FROM profiles WHERE shop_id = ?)`,
      `DELETE FROM holidays WHERE shop_id = ?`,
      `DELETE FROM departments WHERE shop_id = ?`,
      `DELETE FROM designations WHERE shop_id = ?`,
      `DELETE FROM employees WHERE shop_id = ?`,
      `DELETE FROM shop_settings WHERE shop_id = ?`,
      `DELETE FROM profiles WHERE shop_id = ?`,
      `DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE shop_id = ?)`,
      `DELETE FROM roles WHERE shop_id = ?`,
      `DELETE FROM branches WHERE shop_id = ?`,
      `DELETE FROM shops WHERE id = ?`,
    ];
    for (const sql of cleanup) {
      try { await run(sql, shopId); } catch { /* best effort */ }
    }
  }
  await closeDb();
});
