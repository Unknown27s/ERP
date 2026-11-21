const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const app = require('../src/index');
const { get, run, uid } = require('../src/db');
const { ensureRbac } = require('../src/services/rbac');

let server, base, shop, adminToken, employeeRole, leaveType;
const people = [];
const password = 'TestPassword123!';

async function api(method, path, token, body) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  await app.ready;
  shop = uid('shop');
  const id = uid('usr');
  const email = `${id}@test.local`;
  await run('INSERT INTO shops (id, name) VALUES (?,?)', shop, 'Workflow security test');
  await ensureRbac(shop);
  await run("INSERT INTO profiles (user_id, shop_id, role, display_name, email, password_hash, active, is_primary) VALUES (?,?,'admin','Test administrator',?,?,1,1)", id, shop, email, bcrypt.hashSync(password, 10));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await api('POST', '/auth/login', null, { email, password });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
  employeeRole = await get("SELECT id FROM roles WHERE shop_id = ? AND name = 'Employee'", shop);
});

after(() => server?.close());

test('onboarding atomically links an employee and rolls back duplicate employee codes', async () => {
  for (let i = 0; i < 2; i++) {
    const email = `${uid('employee')}@test.local`;
    const created = await api('POST', '/staff/users', adminToken, {
      name: `Employee ${i}`, email, password, role_id: employeeRole.id,
      employee: { emp_code: `EMP-${i}`, joining_date: '2026-01-01' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const employee = await get('SELECT id FROM employees WHERE user_id = ?', created.body.data.user_id);
    assert.ok(employee);
    const login = await api('POST', '/auth/login', null, { email, password });
    assert.equal(login.status, 200);
    people.push({ email, token: login.body.token, id: employee.id });
  }
  const duplicateEmail = `${uid('duplicate')}@test.local`;
  const duplicate = await api('POST', '/staff/users', adminToken, {
    name: 'Duplicate code', email: duplicateEmail, password, role_id: employeeRole.id,
    employee: { emp_code: 'EMP-0', joining_date: '2026-01-01' },
  });
  assert.notEqual(duplicate.status, 201);
  assert.equal(await get('SELECT user_id FROM profiles WHERE email = ?', duplicateEmail), undefined);
});

test('self-service leave cannot read, submit or cancel on behalf of another employee', async () => {
  const type = await api('POST', '/hr/leave-types', adminToken, { name: 'Unpaid test', annual_quota: 0, paid: false });
  assert.equal(type.status, 201);
  leaveType = type.body.data.id;
  const created = await api('POST', '/employee/leaves', people[0].token, {
    employee_id: people[1].id, leave_type_id: leaveType, from_date: '2026-12-10', to_date: '2026-12-10',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.employee_id, people[0].id, 'body cannot override authenticated employee');
  assert.equal((await api('GET', '/hr/leaves', people[0].token)).status, 403);
  assert.equal((await api('POST', '/hr/leaves', people[0].token, { employee_id: people[1].id })).status, 403);
  assert.equal((await api('DELETE', `/employee/leaves/${created.body.data.id}`, people[1].token)).status, 404);
  const requests = await api('GET', '/employee/leaves?year=2026', people[1].token);
  assert.equal(requests.status, 200);
  assert.equal(requests.body.data.requests.length, 0);
  const results = await Promise.all([
    api('DELETE', `/employee/leaves/${created.body.data.id}`, people[0].token),
    api('POST', `/hr/leaves/${created.body.data.id}/decide`, adminToken, { status: 'approved' }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('logout and password changes revoke previously issued sessions', async () => {
  const second = await api('POST', '/auth/login', null, { email: people[0].email, password });
  const changed = await api('POST', '/auth/change-password', people[0].token, {
    currentPassword: password, newPassword: 'NewTestPassword123!',
  });
  assert.equal(changed.status, 200);
  assert.equal((await api('GET', '/auth/me', people[0].token)).status, 401);
  assert.equal((await api('GET', '/auth/me', second.body.token)).status, 401);
  const next = await api('POST', '/auth/login', null, { email: people[0].email, password: 'NewTestPassword123!' });
  assert.equal(next.status, 200);
  assert.equal((await api('POST', '/auth/logout', next.body.token, {})).status, 200);
  assert.equal((await api('GET', '/auth/me', next.body.token)).status, 401);
  assert.equal((await api('GET', '/auth/me', people[1].token)).status, 200, 'other users stay signed in');
});
