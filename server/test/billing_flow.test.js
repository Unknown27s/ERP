const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const path = require('path');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  throw new Error('Missing DATABASE_URL for tests.');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32chars-minimum-xxxxxx';
process.env.MAIL_DISABLED = 'true'; // never send real email from tests

const app = require('../src/index');
const { get, run, uid } = require('../src/db');

let srv;
let base = '';
let token = '';
let shopId = '';
let adminId = '';
let prodId = '';

async function req(method, p, body) {
  const r = await fetch(base + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

before(async () => {
  await app.ready;
  shopId = uid('shop');
  await run(`INSERT INTO shops (id, name) VALUES (?,?)`, shopId, 'Billing Test Boutique');

  adminId = uid('usr');
  const email = `admin_${Date.now()}@test.local`;
  await run(
    `INSERT INTO profiles (user_id, shop_id, role, display_name, email, password_hash, active, is_primary)
     VALUES (?,?,?,?,?,?,1,1)`,
    adminId, shopId, 'admin', 'Shop Admin', email, bcrypt.hashSync('Pass@1234', 10)
  );

  await run(
    `INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, observed_at, approved)
     VALUES (?,?,?,?,?,?,1)`,
    uid('rate'), 'manual', '24K', 8000, 8000, new Date().toISOString()
  );

  const catId = uid('cat');
  await run(
    `INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)`,
    catId, shopId, 'Necklaces', 'necklaces', 'NCK'
  );

  prodId = uid('prd');
  const sku = `NCK-${Date.now().toString().slice(-4)}`;
  await run(
    `INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g,
     making_charge_type, making_charge_value, acquisition_cost_inr, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    prodId, shopId, catId, sku, 'Royal Gold Necklace', '22K', 10, 10, 'percentage', 10, 70000, 'available'
  );
  await run(
    `INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value) VALUES (?,?,?,?)`,
    uid('bc'), prodId, shopId, sku
  );

  srv = app.listen(0);
  base = `http://localhost:${srv.address().port}/api`;

  // Log in as admin
  const login = await req('POST', '/auth/login', { email, password: 'Pass@1234' });
  assert.equal(login.status, 200);
  token = login.data.token;
});

after(() => {
  if (srv) srv.close();
});

async function createItem(opening_quantity = 1) {
  const item = await req('POST', '/products', {
    name: 'Test supplies', sku: uid('SKU'), selling_price_inr: 100,
    acquisition_cost_inr: 60, tax_rate_pct: 5, opening_quantity,
  });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  return item.data.data;
}

test('generic input validation rejects malformed lines, booleans and blank money', async () => {
  const item = await createItem();
  for (const lines of [[null], [{}], [{ product_id: item.id, quantity: true }], [{ product_id: item.id, quantity: 0 }], [{ product_id: item.id, quantity: 1.5 }]]) {
    assert.equal((await req('POST', '/sales/draft', { lines })).status, 400);
  }
  assert.equal((await req('POST', '/purchases', { items: [null] })).status, 400);
  assert.equal((await req('POST', '/sales/missing/finalize', { payments: [null] })).status, 400);
  assert.equal((await req('PATCH', `/products/${item.id}`, { selling_price_inr: ' ' })).status, 400);
});

test('concurrent reservation, finalization and refund each change stock exactly once', async () => {
  const item = await createItem();
  const attempts = await Promise.all([1, 2].map(() => req('POST', '/sales/draft', { lines: [{ product_id: item.id, quantity: 1 }] })));
  assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
  const sale = attempts.find((r) => r.status === 201).data.data;
  const payments = await Promise.all([1, 2].map(() => req('POST', `/sales/${sale.id}/finalize`, { payments: [{ method: 'cash', amount_inr: sale.total_inr }] })));
  assert.deepEqual(payments.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(await get('SELECT stock_on_hand, stock_reserved FROM products WHERE id = ?', item.id), { stock_on_hand: 0, stock_reserved: 0 });
  const refunds = await Promise.all([1, 2].map(() => req('POST', `/sales/${sale.id}/void`, { reason: 'Test refund' })));
  assert.deepEqual(refunds.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(await get('SELECT stock_on_hand, stock_reserved FROM products WHERE id = ?', item.id), { stock_on_hand: 1, stock_reserved: 0 });
  assert.equal((await get('SELECT COUNT(*) n FROM payments WHERE sale_id = ?', sale.id)).n, 1);
  assert.equal((await get('SELECT COUNT(*) n FROM returns_refunds WHERE sale_id = ?', sale.id)).n, 1);
});

test('cancelling a draft releases its reservation once', async () => {
  const item = await createItem(2);
  const draft = await req('POST', '/sales/draft', { lines: [{ product_id: item.id, quantity: 2 }] });
  assert.equal(draft.status, 201);
  const results = await Promise.all([1, 2].map(() => req('POST', `/sales/${draft.data.data.id}/cancel`, {})));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(await get('SELECT stock_on_hand, stock_reserved FROM products WHERE id = ?', item.id), { stock_on_hand: 2, stock_reserved: 0 });
});

test('purchase payment cannot post duplicate supplier expenses', async () => {
  const item = await createItem(0);
  const receipt = await req('POST', '/purchases', { items: [{ product_id: item.id, quantity: 2, unit_cost_inr: 60 }] });
  assert.equal(receipt.status, 201);
  const purchase = receipt.data.data;
  const results = await Promise.all([1, 2].map(() => req('POST', `/purchases/${purchase.id}/pay`, {})));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const expenses = await get("SELECT COUNT(*) n, SUM(amount_inr) total FROM expenses WHERE shop_id = ? AND category = 'supplier_payment' AND note LIKE ?", shopId, `Purchase ${purchase.id} %`);
  assert.equal(expenses.n, 1);
  assert.equal(expenses.total, 120);
});

test('historical invoices are readable without generic price conversion', async () => {
  const id = uid('sal');
  await run("INSERT INTO sales (id, shop_id, invoice_no, sold_at, subtotal_inr, total_inr, status, created_by) VALUES (?,?,?,now(),1234,1234,'finalized',?)", id, shopId, uid('OLD'), adminId);
  const invoice = await req('GET', `/sales/${id}`);
  assert.equal(invoice.status, 200);
  assert.equal(invoice.data.data.pricing_model, 'legacy');
  assert.equal(invoice.data.data.total_inr, 1234);
});

test('flow: phone search returns 0 matches -> not found -> register customer with name, phno, email, birthday, anniversary', async () => {
  const testPhone = `98765${Date.now().toString().slice(-5)}`;

  // 1. Phone search: should return 0 matches
  const search = await req('GET', `/customers/phone/${testPhone}`);
  assert.equal(search.status, 200);
  assert.equal(search.data.data.length, 0);

  // 2. Register new customer with full form
  const reg = await req('POST', '/customers', {
    name: 'Ananya Roy',
    phone: testPhone,
    email: 'ananya@example.com',
    address_line1: '12 MG Road',
    city: 'Bengaluru',
    state: 'KA',
    postal_code: '560001',
    birthday: '1995-04-12',
    anniversary: '2020-11-20',
    marketing_consent: true,
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.data.name, 'Ananya Roy');
  assert.equal(reg.data.data.email, 'ananya@example.com');
  assert.equal(reg.data.data.birthday, '1995-04-12');
  assert.equal(reg.data.data.anniversary, '2020-11-20');

  // 3. Phone search again: should now return the created customer and their purchases array
  const search2 = await req('GET', `/customers/phone/${testPhone}`);
  assert.equal(search2.status, 200);
  assert.equal(search2.data.data.length, 1);
  assert.equal(search2.data.data[0].id, reg.data.data.id);
  assert.ok(Array.isArray(search2.data.data[0].purchases));
});

test('flow: explicit selling price -> discounted draft -> exact payment -> immutable invoice', async () => {
  const testPhone = `99887${Date.now().toString().slice(-5)}`;

  // Create customer
  const custRes = await req('POST', '/customers', {
    name: 'Kavita Krishnan',
    phone: testPhone,
    email: 'kavita@example.com',
    address_line1: '45 Church Street',
    city: 'Bengaluru',
    state: 'KA',
    postal_code: '560001',
  });
  assert.equal(custRes.status, 201);
  const custId = custRes.data.data.id;

  // Legacy estimation remains available, but does not determine new sale prices.
  const est = await req('POST', '/pricing/estimate', { product_id: prodId });
  assert.equal(est.status, 200);
  assert.ok(est.data.data.line_total_inr > 0);
  const priced = await req('PATCH', `/products/${prodId}`, { selling_price_inr: 80000, tax_rate_pct: 0 });
  assert.equal(priced.status, 200);
  const intake = await req('POST', '/purchases', { items: [{ product_id: prodId, quantity: 1, unit_cost_inr: 70000 }] });
  assert.equal(intake.status, 201);

  // Create Draft
  const draft = await req('POST', '/sales/draft', {
    customer_id: custId,
    lines: [{ product_id: prodId, quantity: 1, discount_inr: 5000 }],
  });
  assert.equal(draft.status, 201);
  const saleId = draft.data.data.id;

  // The agreed price is frozen in the draft. Changing the catalogue cannot alter it.
  const editedFinalPrice = 75000;
  assert.equal(draft.data.data.total_inr, editedFinalPrice);
  await req('PATCH', `/products/${prodId}`, { selling_price_inr: 90000 });
  const mismatch = await req('POST', `/sales/${saleId}/finalize`, {
    payments: [{ method: 'upi', amount_inr: editedFinalPrice - 1 }],
  });
  assert.equal(mismatch.status, 400);
  const finalize = await req('POST', `/sales/${saleId}/finalize`, {
    lines: [{ product_id: prodId }],
    custom_final_price_inr: editedFinalPrice,
    payments: [{ method: 'upi', amount_inr: editedFinalPrice }],
  });
  assert.equal(finalize.status, 200);
  assert.equal(finalize.data.data.total_inr, editedFinalPrice);
  assert.ok(finalize.data.data.discount_inr > 0, 'Discount must capture the price reduction');
  assert.equal(finalize.data.data.status, 'finalized');

  // Verify GET /sales/:id returns full invoice details for view & PDF download
  const invoice = await req('GET', `/sales/${saleId}`);
  assert.equal(invoice.status, 200);
  assert.equal(invoice.data.data.total_inr, editedFinalPrice);
  assert.equal(invoice.data.data.customer_name, 'Kavita Krishnan');
  assert.equal(invoice.data.data.customer_email, 'kavita@example.com');
  assert.equal(invoice.data.data.lines.length, 1);
  assert.equal(invoice.data.data.payments.length, 1);
  assert.equal(invoice.data.data.payments[0].amount_inr, editedFinalPrice);

  // Verify Customer lifetime spend was updated to the edited final price
  const custCheck = await req('GET', `/customers/${custId}`);
  assert.equal(custCheck.status, 200);
  assert.equal(custCheck.data.data.total_spent_inr, editedFinalPrice);
  assert.equal(custCheck.data.data.purchase_count, 1);
  assert.equal(custCheck.data.data.purchases.length, 1);
  assert.equal(custCheck.data.data.purchases[0].id, saleId);
});

test('flow: create generic item -> receive stock -> draft -> finalize -> sales history', async () => {
  const testPhone = `91234${Date.now().toString().slice(-5)}`;

  // 1. Register customer
  const custRes = await req('POST', '/customers', {
    name: 'Suresh Patel',
    phone: testPhone,
    email: 'suresh@example.com',
    address_line1: '9 Brigade Road',
    city: 'Bengaluru',
    state: 'KA',
    postal_code: '560001',
    birthday: '1988-06-15',
  });
  assert.equal(custRes.status, 201);
  const custId = custRes.data.data.id;

  // 2. Create a priced item and receive its quantity before selling it.
  const manualSku = `MAN-${Date.now().toString().slice(-4)}`;
  const item = await req('POST', '/products', {
    name: 'Workshop supplies', sku: manualSku, selling_price_inr: 1000,
    acquisition_cost_inr: 700, tax_rate_pct: 5, opening_quantity: 0,
  });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  const intake = await req('POST', '/purchases', {
    items: [{ product_id: item.data.data.id, quantity: 3, unit_cost_inr: 700 }],
  });
  assert.equal(intake.status, 201, JSON.stringify(intake.data));
  const draft = await req('POST', '/sales/draft', {
    customer_id: custId,
    lines: [{ product_id: item.data.data.id, quantity: 2 }],
  });
  assert.equal(draft.status, 201);
  const saleId = draft.data.data.id;

  // 3. Finalize with custom agreed price
  const agreedPrice = 2100;
  const finalize = await req('POST', `/sales/${saleId}/finalize`, {
    custom_final_price_inr: agreedPrice,
    payments: [{ method: 'card', amount_inr: agreedPrice }],
  });
  assert.equal(finalize.status, 200);
  assert.equal(finalize.data.data.total_inr, agreedPrice);
  assert.equal(finalize.data.data.status, 'finalized');

  // 4. Check history listing contains customer phone and invoice
  const history = await req('GET', `/sales?q=${encodeURIComponent(testPhone)}`);
  assert.equal(history.status, 200);
  assert.equal(history.data.data.length, 1);
  assert.equal(history.data.data[0].id, saleId);
  assert.equal(history.data.data[0].customer_name, 'Suresh Patel');
  assert.equal(history.data.data[0].customer_phone, testPhone);
  const stock = await get('SELECT stock_on_hand, stock_reserved FROM products WHERE id = ?', item.data.data.id);
  assert.deepEqual(stock, { stock_on_hand: 1, stock_reserved: 0 });
});
