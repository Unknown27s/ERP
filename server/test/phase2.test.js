/**
 * Phase 2 acceptance tests — CRM pipeline.
 *
 * Covers the lead → customer conversion, follow-up activities, support cases,
 * tenant isolation, soft archiving and the granular permission checks that
 * replaced the remaining legacy `requireRoles('admin')` guards.
 *
 * Uses a throwaway shop like foundation.test.js and removes it in `after`.
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
const PASSWORD = 'Password@123';
let base = '';
let srv = null;
let shopId = '';
let otherShopId = '';
let adminId = '';
let adminTok = '';
let salesTok = '';
let employeeTok = '';
let financeTok = '';
const email = (name) => `phase2_${name}_${runId}@test.local`;
const adminEmail = email('admin');

async function api(method, path, token, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

async function mkUser(shop, mail, roleName) {
  const role = await get('SELECT id, name FROM roles WHERE shop_id = ? AND name = ?', shop, roleName);
  assert.ok(role, `role ${roleName} must exist`);
  const id = uid('usr');
  await run(
    `INSERT INTO profiles (user_id, shop_id, role, role_id, display_name, email, password_hash, active, is_primary)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    id, shop, roleName === 'Administrator' ? 'admin' : 'staff', role.id, mail, mail,
    bcrypt.hashSync(PASSWORD, 10), roleName === 'Administrator' ? 1 : 0
  );
  return id;
}

async function login(mail) {
  const r = await api('POST', '/auth/login', null, { email: mail, password: PASSWORD });
  assert.equal(r.status, 200, `login ${mail}`);
  return r.body.token;
}

const ADDRESS = { address_line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' };

before(async () => {
  await app.ready;

  shopId = uid('shop');
  await run('INSERT INTO shops (id, name, timezone, currency) VALUES (?,?,?,?)', shopId, 'Phase 2 Test Co', 'Asia/Kolkata', 'INR');
  await ensureRbac(shopId);
  adminId = await mkUser(shopId, adminEmail, 'Administrator');
  await mkUser(shopId, email('sales'), 'Sales');
  await mkUser(shopId, email('employee'), 'Employee');
  await mkUser(shopId, email('finance'), 'Finance');

  // A second tenant, used only to prove cross-company records stay invisible.
  otherShopId = uid('shop');
  await run('INSERT INTO shops (id, name, timezone, currency) VALUES (?,?,?,?)', otherShopId, 'Phase 2 Other Co', 'Asia/Kolkata', 'INR');

  srv = app.listen(0);
  base = `http://localhost:${srv.address().port}/api`;

  adminTok = await login(adminEmail);
  salesTok = await login(email('sales'));
  employeeTok = await login(email('employee'));
  financeTok = await login(email('finance'));
});

test('CRM pipeline is permission-gated server-side', async () => {
  const employeeRead = await api('GET', '/leads', employeeTok);
  assert.equal(employeeRead.status, 403);
  assert.equal(employeeRead.body.required, 'crm.view');

  const employeeWrite = await api('POST', '/leads', employeeTok, { name: 'Blocked lead' });
  assert.equal(employeeWrite.status, 403);
  assert.equal(employeeWrite.body.required, 'crm.manage');

  // Finance has no CRM grant even though it can read reports.
  const financeRead = await api('GET', '/leads', financeTok);
  assert.equal(financeRead.status, 403);

  const salesRead = await api('GET', '/leads', salesTok);
  assert.equal(salesRead.status, 200);
  assert.ok(Array.isArray(salesRead.body.data));

  const salesCreate = await api('POST', '/leads', salesTok, { name: `Permission lead ${runId}` });
  assert.equal(salesCreate.status, 201);
  assert.ok(salesCreate.body.data.lead_code.startsWith('L'));

  // Legacy admin-only campaign/offer guards now follow CRM permissions too.
  const offers = await api('GET', '/offers', salesTok);
  assert.equal(offers.status, 200);
  const offersDenied = await api('GET', '/offers', employeeTok);
  assert.equal(offersDenied.status, 403);
  assert.equal(offersDenied.body.required, 'crm.view');

  // The dashboard only exposes CRM counters to CRM-capable roles.
  const salesDash = await api('GET', '/dashboard', salesTok);
  assert.equal(salesDash.status, 200);
  assert.equal(typeof salesDash.body.data.open_leads, 'number');
  const employeeDash = await api('GET', '/dashboard', employeeTok);
  assert.equal(employeeDash.status, 200);
  assert.equal(employeeDash.body.data.open_leads, null);
});

test('former admin-only routes now follow named permissions', async () => {
  // Staff and company administration no longer depend on the legacy admin flag.
  const employeeStaff = await api('GET', '/admin/staff', employeeTok);
  assert.equal(employeeStaff.status, 403);
  assert.equal(employeeStaff.body.required, 'staff.view');

  const employeeSettings = await api('GET', '/admin/settings', employeeTok);
  assert.equal(employeeSettings.status, 403);
  assert.equal(employeeSettings.body.required, 'company.manage');

  // Email configuration needs company.manage or crm.manage; Finance only holds finance.*.
  // The email router is mounted under /admin, matching the SPA path.
  const financeEmail = await api('GET', '/admin/email/settings', financeTok);
  assert.equal(financeEmail.status, 403);
  assert.deepEqual(financeEmail.body.required, ['company.manage', 'crm.manage']);

  // Inventory and CRM permissions now govern their former admin-only routes.
  const employeeRates = await api('GET', '/gold-rates', employeeTok);
  assert.equal(employeeRates.status, 403);
  assert.equal(employeeRates.body.required, 'inventory.view');

  const salesRates = await api('GET', '/gold-rates', salesTok);
  assert.equal(salesRates.status, 200);

  const employeeFestivals = await api('GET', '/admin/festivals', employeeTok);
  assert.equal(employeeFestivals.status, 403);
  assert.equal(employeeFestivals.body.required, 'crm.view');

  const salesFestivals = await api('GET', '/admin/festivals', salesTok);
  assert.equal(salesFestivals.status, 200);

  const financeSuppliers = await api('GET', '/suppliers', financeTok);
  assert.equal(financeSuppliers.status, 200);

  const financeSupplierCreate = await api('POST', '/suppliers', financeTok, { name: `Denied ${runId}` });
  assert.equal(financeSupplierCreate.status, 403);
  assert.equal(financeSupplierCreate.body.required, 'inventory.manage');

  // Sales hold crm.manage, so the permission passes and validation answers 400.
  const salesDraft = await api('POST', '/sales/draft', salesTok, {});
  assert.equal(salesDraft.status, 400);
});

test('lead can be worked and converted into a customer exactly once', async () => {
  const created = await api('POST', '/leads', adminTok, {
    name: 'Radhika Sethi',
    company: 'Sethi Textiles',
    phone: '9876512340',
    email: 'radhika@example.com',
    source: 'referral',
    stage: 'qualified',
    estimated_value_inr: 85000,
    next_follow_up_on: '2030-01-15',
    notes: `Phase 2 lead ${runId}`,
  });
  assert.equal(created.status, 201);
  const lead = created.body.data;
  assert.equal(lead.stage, 'qualified');
  assert.equal(lead.owner_user_id, adminId);
  assert.equal(lead.normalized_phone, '9876512340');

  const list = await api('GET', `/leads?q=${encodeURIComponent('Radhika')}`, adminTok);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((row) => row.id === lead.id));

  const moved = await api('PATCH', `/leads/${lead.id}`, adminTok, { stage: 'proposal' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.stage, 'proposal');

  // Winning requires the conversion endpoint, which also creates the customer.
  const prematureWin = await api('PATCH', `/leads/${lead.id}`, adminTok, { stage: 'won' });
  assert.equal(prematureWin.status, 400);

  const incomplete = await api('POST', `/leads/${lead.id}/convert`, adminTok, { city: 'Bengaluru' });
  assert.equal(incomplete.status, 400);
  assert.ok(incomplete.body.fields.includes('address_line1'));

  const converted = await api('POST', `/leads/${lead.id}/convert`, adminTok, {
    ...ADDRESS,
    notes: `Converted in phase 2 ${runId}`,
  });
  assert.equal(converted.status, 201);
  assert.equal(converted.body.data.lead.stage, 'won');
  assert.ok(converted.body.data.lead.customer_id);
  assert.equal(converted.body.data.customer.name, 'Radhika Sethi');
  const customerId = converted.body.data.customer.id;

  const again = await api('POST', `/leads/${lead.id}/convert`, adminTok, ADDRESS);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'already_converted');

  const audit = await get(
    `SELECT action, summary FROM audit_logs WHERE actor_id = ? AND action = 'crm.lead.convert'
     ORDER BY created_at DESC LIMIT 1`,
    adminId
  );
  assert.ok(audit, 'lead conversion must be audited');
  assert.match(audit.summary, new RegExp(lead.lead_code));
  assert.ok(await get('SELECT id FROM customers WHERE id = ? AND shop_id = ?', customerId, shopId));
});

test('activities track follow-ups and are archived, never deleted', async () => {
  const lead = (await api('POST', '/leads', adminTok, { name: `Follow-up lead ${runId}` })).body.data;
  const due = '2020-01-01';

  const created = await api('POST', '/activities', adminTok, {
    lead_id: lead.id,
    kind: 'call',
    subject: `Call back ${runId}`,
    due_on: due,
  });
  assert.equal(created.status, 201);
  const activity = created.body.data;
  assert.equal(activity.lead_id, lead.id);

  const overdue = await api('GET', '/activities?due=overdue', adminTok);
  assert.equal(overdue.status, 200);
  assert.ok(overdue.body.data.some((row) => row.id === activity.id));

  const pipeline = await api('GET', '/crm/pipeline', adminTok);
  assert.equal(pipeline.status, 200);
  assert.ok(pipeline.body.data.activities.overdue_open >= 1);

  const done = await api('PATCH', `/activities/${activity.id}`, adminTok, { done: true, outcome: 'Connected' });
  assert.equal(done.status, 200);
  assert.ok(done.body.data.done_at);
  assert.equal(done.body.data.outcome, 'Connected');

  const openOnly = await api('GET', `/activities?lead_id=${lead.id}&done=0`, adminTok);
  assert.equal(openOnly.body.data.length, 0);

  const archived = await api('DELETE', `/activities/${activity.id}`, adminTok);
  assert.equal(archived.status, 200);
  const row = await get('SELECT active, subject FROM crm_activities WHERE id = ?', activity.id);
  assert.ok(row, 'activity row must still exist');
  assert.equal(row.active, 0);
});

test('support cases move through a status lifecycle', async () => {
  const created = await api('POST', '/support-cases', salesTok, {
    subject: `Damaged item ${runId}`,
    description: 'Customer reported a scratch.',
    priority: 'high',
  });
  assert.equal(created.status, 201);
  const c = created.body.data;
  assert.equal(c.status, 'open');
  assert.equal(c.resolved_at, null);
  assert.ok(c.case_code.startsWith('SC'));

  const resolved = await api('PATCH', `/support-cases/${c.id}`, salesTok, { status: 'resolved' });
  assert.equal(resolved.status, 200);
  assert.ok(resolved.body.data.resolved_at);

  const reopened = await api('PATCH', `/support-cases/${c.id}`, salesTok, { status: 'open' });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.data.resolved_at, null);

  const list = await api('GET', '/support-cases?priority=high', adminTok);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((row) => row.id === c.id));

  const archived = await api('DELETE', `/support-cases/${c.id}`, adminTok);
  assert.equal(archived.status, 200);
  const row = await get('SELECT active FROM crm_support_cases WHERE id = ?', c.id);
  assert.ok(row, 'support case row must still exist');
  assert.equal(row.active, 0);
});

test('CRM records are isolated by company', async () => {
  const foreignId = uid('lead');
  await run(
    `INSERT INTO crm_leads (id, shop_id, lead_code, name, stage, created_by)
     VALUES (?,?,?,?,?,?)`,
    foreignId, otherShopId, `L-OTHER-${runId}`, 'Other company lead', 'new', adminId
  );

  const list = await api('GET', '/leads', adminTok);
  assert.equal(list.status, 200);
  assert.ok(!list.body.data.some((row) => row.id === foreignId));

  const direct = await api('GET', `/leads/${foreignId}`, adminTok);
  assert.equal(direct.status, 404);

  const attach = await api('POST', '/activities', adminTok, {
    lead_id: foreignId,
    subject: 'Cross-tenant attempt',
  });
  assert.equal(attach.status, 400);

  const archive = await api('DELETE', `/leads/${foreignId}`, adminTok);
  assert.equal(archive.status, 404);
});

test('report cost data is restricted to finance-capable roles', async () => {
  const salesReport = await api('GET', '/reports/sales', salesTok);
  assert.equal(salesReport.status, 200);
  assert.equal(salesReport.body.data.gross_profit_estimate, null);

  const financeReport = await api('GET', '/reports/sales', financeTok);
  assert.equal(financeReport.status, 200);
  assert.equal(typeof financeReport.body.data.gross_profit_estimate, 'number');

  const employeeReport = await api('GET', '/reports/sales', employeeTok);
  assert.equal(employeeReport.status, 403);
  assert.equal(employeeReport.body.required, 'reports.view');
});

after(async () => {
  if (srv) {
    const closed = new Promise((resolve) => srv.close(resolve));
    if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
    await closed;
  }
  for (const shop of [shopId, otherShopId].filter(Boolean)) {
    const cleanup = [
      `DELETE FROM crm_activities WHERE shop_id = ?`,
      `DELETE FROM crm_support_cases WHERE shop_id = ?`,
      `DELETE FROM crm_leads WHERE shop_id = ?`,
      `DELETE FROM occasion_sends WHERE shop_id = ?`,
      `DELETE FROM festivals WHERE shop_id = ?`,
      `DELETE FROM audit_logs WHERE actor_id IN (SELECT user_id FROM profiles WHERE shop_id = ?)`,
      `DELETE FROM customers WHERE shop_id = ?`,
      `DELETE FROM shop_settings WHERE shop_id = ?`,
      `DELETE FROM profiles WHERE shop_id = ?`,
      `DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE shop_id = ?)`,
      `DELETE FROM roles WHERE shop_id = ?`,
      `DELETE FROM branches WHERE shop_id = ?`,
      `DELETE FROM shops WHERE id = ?`,
    ];
    for (const sql of cleanup) {
      try { await run(sql, shop); } catch { /* best effort */ }
    }
  }
  await closeDb();
});
