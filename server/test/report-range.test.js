const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/index');
const { run, get, uid, closeDb } = require('../src/db');
const { sign } = require('../src/middleware/auth');
const { ensureRbac } = require('../src/services/rbac');
const { reportRange } = require('../src/services/report-range');
let server, base, shop, token;
async function api(path) {
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  await app.ready;
  shop = uid('shop');
  await run('INSERT INTO shops (id,name) VALUES (?,?)', shop, 'Report range test');
  await ensureRbac(shop);
  const id = uid('usr');
  await run("INSERT INTO profiles (user_id,shop_id,role,display_name,email,password_hash,active) VALUES (?,?,'admin','Report administrator',?,?,1)", id, shop, `${id}@test.local`, 'not-used-by-this-test');
  token = sign(await get('SELECT * FROM profiles WHERE user_id=?', id));
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { await new Promise((resolve) => server?.close(resolve)); await closeDb(); });

test('custom reports include the whole last company day and group sales in company time', async () => {
  for (const [instant, amount] of [['2026-12-14T18:29:59.999Z', 1000], ['2026-12-14T18:30:00.000Z', 10], ['2026-12-15T18:29:59.999Z', 20], ['2026-12-15T18:30:00.000Z', 2000]]) {
    const id = uid('sale');
    await run("INSERT INTO sales (id,shop_id,invoice_no,sold_at,subtotal_inr,total_inr,status) VALUES (?,?,?,?,?,?,'finalized')", id, shop, id, instant, amount, amount);
  }
  const response = await api('/reports/sales?from=2026-12-15&to=2026-12-15');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.data.revenue, 30);
  assert.equal(response.body.data.bill_count, 2);
  assert.equal(response.body.data.from, '2026-12-14T18:30:00.000Z');
  assert.equal(response.body.data.to, '2026-12-15T18:30:00.000Z');
  assert.equal(response.body.data.end_exclusive, true);
  assert.equal(response.body.data.timezone, 'Asia/Kolkata');
  assert.deepEqual(response.body.data.byDay.map((row) => [row.d, row.revenue]), [['2026-12-15', 30]]);
});

test('report date validation rejects partial, reversed and impossible calendar dates', async () => {
  for (const query of ['from=2026-12-01', 'from=2026-12-15&to=2026-12-01', 'from=2026-02-30&to=2026-03-01', 'preset=unknown']) {
    for (const endpoint of ['sales', 'customers', 'category-products']) assert.equal((await api(`/reports/${endpoint}?${query}`)).status, 400);
  }
});

test('calendar range boundaries handle daylight-saving days without assuming 24 hours', async () => {
  await run('INSERT INTO shop_settings (shop_id,key,value) VALUES (?,?,?)', shop, 'timezone', 'America/New_York');
  const range = await reportRange({ user: { shop_id: shop }, query: { from: '2026-03-08', to: '2026-03-08' } });
  assert.equal(range.s, '2026-03-08T05:00:00.000Z');
  assert.equal(range.e, '2026-03-09T04:00:00.000Z');
});
