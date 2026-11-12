/**
 * ERP seed — Phase 0/1 foundation.
 *
 * Idempotent: safe to run repeatedly. Creates one company, the role catalogue,
 * the company settings, one login per default role, and a small generic HR demo
 * (departments, designations, employees, leave and payroll) so every screen has
 * real records to read and write.
 *
 * Run with:  npm run seed
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const { get, run, initDb, closeDb, uid } = require('./db');
const { ensureRbac } = require('./services/rbac');
const { seedHrDemo } = require('./seed-hr');

const COMPANY = process.env.COMPANY_NAME || 'MarvelSoftware';
const COMPANY_LEGAL = process.env.COMPANY_LEGAL_NAME || 'MarvelSoftware';

const DEMO_USERS = [
  { email: 'admin@marvelsoftware.local', password: 'Admin@123', name: 'System Administrator', role: 'Administrator', primary: true, phone: '+91 90000 00001' },
  { email: 'manager@marvelsoftware.local', password: 'Manager@123', name: 'Meera Menon', role: 'Manager', phone: '+91 90000 00002' },
  { email: 'hr@marvelsoftware.local', password: 'Hr@12345', name: 'Anita Sharma', role: 'HR', phone: '+91 90000 00003' },
  { email: 'finance@marvelsoftware.local', password: 'Finance@123', name: 'Rahul Verma', role: 'Finance', phone: '+91 90000 00004' },
  { email: 'store@marvelsoftware.local', password: 'Store@123', name: 'Kiran Patel', role: 'Store', phone: '+91 90000 00005' },
  { email: 'sales@marvelsoftware.local', password: 'Sales@123', name: 'Priya Nair', role: 'Sales', phone: '+91 90000 00006' },
  { email: 'employee@marvelsoftware.local', password: 'Employee@123', name: 'Arjun Rao', role: 'Employee', phone: '+91 90000 00007' },
];

const SETTINGS = {
  product_name: COMPANY,
  company_name: COMPANY,
  shop_name: COMPANY,
  company_legal_name: COMPANY_LEGAL,
  company_email: 'admin@marvelsoftware.local',
  company_phone: '+91 80000 00000',
  company_address: 'MG Road, Bengaluru, Karnataka 560001',
  shop_address: 'MG Road, Bengaluru, Karnataka 560001',
  shop_phone: '+91 80000 00000',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  financial_year_start: '04-01',
  invoice_prefix: 'INV',
  invoice_footer: 'Thank you for your business.',
  occasion_autosend: 'no',
  occasion_window_days: '10',
};

async function ensureShop() {
  let shop = await get('SELECT * FROM shops ORDER BY id LIMIT 1');
  if (!shop) {
    const id = uid('shop');
    await run('INSERT INTO shops (id, name, timezone, currency) VALUES (?,?,?,?)', id, COMPANY, 'Asia/Kolkata', 'INR');
    await run('INSERT INTO branches (id, shop_id, name, address) VALUES (?,?,?,?)', uid('br'), id, 'Head Office', 'MG Road, Bengaluru');
    shop = await get('SELECT * FROM shops WHERE id = ?', id);
    console.log(`[seed] created company ${COMPANY}`);
  }
  return shop;
}

async function ensureSettings(shopId) {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await run(
      `INSERT INTO shop_settings (shop_id, key, value) VALUES (?,?,?)
       ON CONFLICT (shop_id, key) DO NOTHING`,
      shopId, key, value
    );
  }
}

async function ensureUser(shop, spec) {
  const existing = await get('SELECT * FROM profiles WHERE email = ?', spec.email);
  const role = await get('SELECT * FROM roles WHERE shop_id = ? AND name = ?', shop.id, spec.role);
  if (!role) throw new Error(`role ${spec.role} missing — run migrations first`);
  const legacyRole = spec.role === 'Administrator' ? 'admin' : 'staff';

  if (existing) {
    await run(
      `UPDATE profiles SET role_id = ?, role = ?, display_name = ?, active = 1 WHERE user_id = ?`,
      role.id, legacyRole, spec.name, existing.user_id
    );
    return get('SELECT * FROM profiles WHERE user_id = ?', existing.user_id);
  }

  const id = uid('usr');
  await run(
    `INSERT INTO profiles (user_id, shop_id, role, role_id, display_name, email, phone, password_hash, active, is_primary)
     VALUES (?,?,?,?,?,?,?,?,1,?)`,
    id, shop.id, legacyRole, role.id, spec.name, spec.email, spec.phone || null,
    bcrypt.hashSync(spec.password, 10), spec.primary ? 1 : 0
  );
  return get('SELECT * FROM profiles WHERE user_id = ?', id);
}

async function main() {
  await initDb();
  const shop = await ensureShop();
  await ensureRbac(shop.id);
  await ensureSettings(shop.id);

  let admin = null;
  for (const spec of DEMO_USERS) {
    const user = await ensureUser(shop, spec);
    if (!admin && spec.role === 'Administrator') admin = user;
  }
  if (!admin) admin = await get(`SELECT * FROM profiles WHERE shop_id = ? AND role = 'admin' ORDER BY user_id LIMIT 1`, shop.id);

  await seedHrDemo(shop, admin);

  console.log('\n[seed] Done. Demo logins (change before production):');
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(14)} ${u.email} / ${u.password}`);
  console.log('');
}

main()
  .then(async () => { await closeDb(); })
  .catch(async (e) => {
    console.error('[seed] failed:', e);
    try { await closeDb(); } catch { /* ignore */ }
    process.exit(1);
  });
