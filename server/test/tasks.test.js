const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const app = require('../src/index');
const { get, run, uid, closeDb } = require('../src/db');
const { ensureRbac } = require('../src/services/rbac');

let server, base, shop, outsider, inactive;
const people = {};
const password = 'TaskFixturePassword123!';
async function api(method, path, token, body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function createTask(overrides = {}, token = people.Manager.token) {
  return api('POST', '/tasks', token, { title: 'Review the stock count', description: 'Compare the register with received stock.', assigned_to: people.Employee.id, due_date: '2026-12-15', ...overrides });
}

before(async () => {
  await app.ready;
  shop = uid('shop');
  await run('INSERT INTO shops (id, name) VALUES (?,?)', shop, `Task workflow ${shop}`);
  await ensureRbac(shop);
  for (const name of ['Administrator', 'Manager', 'HR', 'Finance', 'Store', 'Sales', 'Employee']) {
    const role = await get('SELECT id FROM roles WHERE shop_id=? AND name=?', shop, name);
    const id = uid('usr');
    const email = `${id}@test.local`;
    await run(`INSERT INTO profiles (user_id, shop_id, role, role_id, display_name, email, password_hash, active) VALUES (?,?,?,?,?,?,?,1)`, id, shop, name === 'Administrator' ? 'admin' : 'staff', role.id, `Test ${name}`, email, bcrypt.hashSync(password, 4));
    const login = await api('POST', '/auth/login', null, { email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role_name, name);
    people[name] = { id, email, token: login.body.token };
  }
  const otherShop = uid('shop');
  await run('INSERT INTO shops (id, name) VALUES (?,?)', otherShop, 'Other task company');
  outsider = uid('usr'); inactive = uid('usr');
  for (const [id, shopId, active] of [[outsider, otherShop, 1], [inactive, shop, 0]]) {
    await run("INSERT INTO profiles (user_id,shop_id,role,display_name,email,password_hash,active) VALUES (?,?,'staff','Other person',?,?,?)", id, shopId, `${id}@test.local`, bcrypt.hashSync(password, 4), active);
  }
});

// Start the listener before creating login fixtures; app.ready is awaited by the hook.
server = app.listen(0);
base = `http://127.0.0.1:${server.address().port}/api`;
after(async () => { await new Promise((resolve) => server.close(resolve)); await closeDb(); });

test('each role can open its own tasks; only personnel managers may assign or read team work', async () => {
  assert.equal((await api('GET', '/tasks')).status, 401);
  for (const [role, person] of Object.entries(people)) {
    assert.equal((await api('GET', '/tasks?scope=mine', person.token)).status, 200);
    const allowed = ['Administrator', 'Manager', 'HR'].includes(role);
    assert.equal((await api('GET', '/tasks?scope=team', person.token)).status, allowed ? 200 : 403);
    assert.equal((await api('GET', '/tasks/assignees', person.token)).status, allowed ? 200 : 403);
    if (!allowed) assert.equal((await createTask({}, person.token)).status, 403);
  }
  const roster = await api('GET', '/tasks/assignees', people.Manager.token);
  assert.equal(roster.body.data.length, 7);
  assert.ok(roster.body.data.every((row) => !('password_hash' in row) && !('email' in row)));
});

test('assignment appears only for its owner and follows start, block, resume, complete with audit', async () => {
  const created = await createTask();
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const task = created.body.data;
  assert.equal(task.status, 'pending');
  assert.equal(task.assigned_by, people.Manager.id);
  const mine = await api('GET', '/tasks?scope=mine', people.Employee.token);
  assert.ok(mine.body.data.some((row) => row.id === task.id));
  const other = await api('GET', '/tasks?scope=mine', people.Sales.token);
  assert.ok(!other.body.data.some((row) => row.id === task.id));
  assert.equal((await api('PATCH', `/tasks/${task.id}/status`, people.Sales.token, { status: 'in_progress', version: 1 })).status, 404);
  assert.equal((await api('PATCH', `/tasks/${task.id}/status`, people.Manager.token, { status: 'in_progress', version: 1 })).status, 404, 'assigner cannot impersonate the assignee');
  let version = 1;
  for (const [status, note] of [['in_progress', 'Starting review'], ['blocked', 'Waiting for a supplier receipt'], ['in_progress', 'Receipt received'], ['completed', 'Stock and register match']]) {
    const response = await api('PATCH', `/tasks/${task.id}/status`, people.Employee.token, { status, note, version });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    version++;
    assert.equal(response.body.data.version, version);
    assert.equal(response.body.data.status, status);
    assert.equal(Boolean(response.body.data.completed_at), status === 'completed');
  }
  const completed = await api('GET', '/tasks?scope=team&status=completed', people.Manager.token);
  assert.ok(completed.body.data.some((row) => row.id === task.id && row.progress_note === 'Stock and register match'));
  assert.equal((await get('SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=? AND action IN (?,?)', task.id, 'task.assign', 'task.status')).n, 5);
  assert.equal((await api('PATCH', `/tasks/${task.id}/status`, people.Employee.token, { status: 'in_progress', version })).status, 409);
});

test('invalid targets, fields, dates and pagination are rejected without creating tasks', async () => {
  for (const assigned_to of [outsider, inactive, 'does-not-exist']) assert.equal((await createTask({ assigned_to })).status, 400);
  for (const due_date of ['2026-02-30', 'not-a-date', 7]) assert.equal((await createTask({ due_date })).status, 400);
  assert.equal((await createTask({ title: ' ' })).status, 400);
  assert.equal((await createTask({ title: 'a'.repeat(201) })).status, 400);
  assert.equal((await createTask({ description: 'a'.repeat(5001) })).status, 400);
  assert.equal((await createTask({ status: 'completed' })).status, 400);
  for (const path of ['/tasks?scope=invalid', '/tasks?status=invalid', '/tasks?page=0', '/tasks?page=1.1']) assert.equal((await api('GET', path, people.Manager.token)).status, 400);
});

test('stale concurrent changes cannot overwrite progress and blocked status requires a note', async () => {
  const created = await createTask();
  const id = created.body.data.id;
  const changes = await Promise.all([1, 2].map(() => api('PATCH', `/tasks/${id}/status`, people.Employee.token, { status: 'in_progress', version: 1 })));
  assert.deepEqual(changes.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await api('PATCH', `/tasks/${id}/status`, people.Employee.token, { status: 'blocked', version: 2 })).status, 400);
  assert.equal((await api('PATCH', `/tasks/${id}/status`, people.Employee.token, { status: 'completed', version: 2, assigned_to: people.Manager.id })).status, 400);
  assert.equal((await get('SELECT version FROM task_assignments WHERE id=?', id)).version, 2);
});

test('demo roster is on by default, includes only allowlisted people, and can be disabled', async () => {
  const previous = { login: process.env.PREVIEW_LOGIN, emails: process.env.PREVIEW_EMAILS, passwords: process.env.PREVIEW_PASSWORDS, company: process.env.COMPANY_NAME };
  try {
    process.env.COMPANY_NAME = `Task workflow ${shop}`;
    process.env.PREVIEW_EMAILS = Object.values(people).map((person) => person.email).join(',');
    process.env.PREVIEW_PASSWORDS = Object.values(people).map((person) => `${person.email}:${password}`).join(',');
    delete process.env.PREVIEW_LOGIN;
    let response = await api('GET', '/config');
    assert.equal(response.body.data.preview.enabled, true);
    assert.equal(response.body.data.preview.accounts.length, 7);
    assert.deepEqual(response.body.data.preview.accounts.map((person) => person.role), Object.keys(people));
    assert.equal(response.body.data.preview.accounts[0].password, password);
    assert.ok(response.body.data.preview.accounts.every((person) => !('password_hash' in person)));
    assert.ok(response.body.data.preview.accounts.every((person) => Object.values(people).some((known) => known.email === person.email)));
    process.env.PREVIEW_LOGIN = '0';
    response = await api('GET', '/config');
    assert.deepEqual(response.body.data.preview, { enabled: false, accounts: [] });
  } finally {
    for (const [key, value] of Object.entries({ PREVIEW_LOGIN: previous.login, PREVIEW_EMAILS: previous.emails, PREVIEW_PASSWORDS: previous.passwords, COMPANY_NAME: previous.company })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
