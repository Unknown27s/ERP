/**
 * Small report-only sample for an empty shop.
 *
 * Run with: npm run seed:reports -w server -- --shop-id=<shop id>
 * Never edits existing business records. Can update only this script's original
 * jewellery-themed sample rows to generic products; all writes are transactional.
 */
const { get, withTransaction, closeDb, uid } = require('./db');

const shopId = process.argv.find((arg) => arg.startsWith('--shop-id='))?.slice('--shop-id='.length);
const categories = [
  ['Office Supplies', 'office-supplies', 'RPT-OFC'],
  ['Electronics', 'electronics', 'RPT-ELC'],
  ['Home & Living', 'home-living', 'RPT-HOM'],
];
const productNames = [
  'Desk Organiser', 'Notebook Set', 'Office Chair', 'Standing Desk', 'Document Tray', 'Whiteboard',
  'Wireless Keyboard', 'USB-C Hub', 'Desk Monitor', 'Webcam', 'Bluetooth Speaker', 'Portable Charger',
  'Table Lamp', 'Storage Basket', 'Wall Clock', 'Water Bottle', 'Cushion Set', 'Air Purifier',
];
const customerNames = ['Asha Rao', 'Vikram Shah', 'Neha Iyer', 'Rahul Nair', 'Divya Mehta', 'Kiran Das'];
const customerForSale = [0, 0, 1, 1, 2, 2, 3, 4, 0, 1, 2, 3];
const methods = ['upi', 'cash', 'card', 'bank_transfer'];

async function upgradeOldSamples(tx) {
  const oldCategories = ['Rings', 'Chains', 'Earrings'];
  const oldNames = ['Classic Ring', 'Gold Chain', 'Stud Earrings'];
  const expected = await tx.get(`SELECT
    (SELECT COUNT(*) FROM products WHERE shop_id=? AND sku LIKE ?) AS products,
    (SELECT COUNT(*) FROM sales WHERE shop_id=? AND invoice_no LIKE ?) AS sales,
    (SELECT COUNT(*) FROM customers WHERE shop_id=? AND customer_code LIKE 'RPT-C%') AS customers,
    (SELECT COUNT(*) FROM categories WHERE shop_id=? AND name = ANY(?)) AS categories`,
  shopId, `RPT-${shopId}-%`, shopId, `RPT-${shopId}-%`, shopId, shopId, oldCategories);
  if (expected.products !== 18 || expected.sales !== 12 ||
      expected.customers !== 6 || expected.categories !== 3) return false;
  for (let i = 0; i < 18; i++) {
    const sku = `RPT-${shopId}-${String(i + 1).padStart(2, '0')}`;
    const product = await tx.get('SELECT id, name FROM products WHERE shop_id=? AND sku=?', shopId, sku);
    if (!product || product.name !== `${oldNames[Math.floor(i / 6)]} ${i % 6 + 1}`) return false;
  }
  for (let i = 0; i < categories.length; i++) {
    await tx.run('UPDATE categories SET name=?, slug=?, sku_prefix=? WHERE shop_id=? AND name=?',
      ...categories[i], shopId, oldCategories[i]);
  }
  for (let i = 0; i < productNames.length; i++) {
    const sku = `RPT-${shopId}-${String(i + 1).padStart(2, '0')}`;
    await tx.run(`UPDATE products SET name=?, purity='N/A', gross_weight_g=1,
      net_gold_weight_g=1, making_charge_value=0 WHERE shop_id=? AND sku=?`,
    productNames[i], shopId, sku);
    await tx.run(`UPDATE sale_items SET name=?, purity='N/A', net_gold_weight_g=1,
      gold_value_inr=gold_value_inr+making_charge_inr, making_charge_inr=0
      WHERE product_id=(SELECT id FROM products WHERE shop_id=? AND sku=?)`,
    productNames[i], shopId, sku);
  }
  return true;
}

async function main() {
  if (!shopId) throw new Error('Pass --shop-id=<id> to select the demo shop explicitly.');
  const shop = await get('SELECT id, name FROM shops WHERE id=?', shopId);
  if (!shop || shop.name !== 'MarvelSoftware') {
    throw new Error('Report samples can only be added to the explicitly selected MarvelSoftware shop.');
  }

  const result = await withTransaction(async (tx) => {
    // Serialize concurrent invocations; never add sample records to a shop with real data.
    await tx.get('SELECT id FROM shops WHERE id=? FOR UPDATE', shopId);
    const counts = await tx.get(`SELECT
      (SELECT COUNT(*) FROM products WHERE shop_id=?) AS products,
      (SELECT COUNT(*) FROM customers WHERE shop_id=?) AS customers,
      (SELECT COUNT(*) FROM sales WHERE shop_id=?) AS sales`, shopId, shopId, shopId);
    if (counts.products || counts.customers || counts.sales) {
      const upgraded = counts.products === 18 && counts.customers === 6 && counts.sales === 12
        && await upgradeOldSamples(tx);
      return { skipped: true, upgraded, counts };
    }

    const categoryIds = [];
    for (const [name, slug, prefix] of categories) {
      const existing = await tx.get('SELECT id FROM categories WHERE shop_id=? AND slug=?', shopId, slug);
      if (existing) {
        categoryIds.push(existing.id);
      } else {
        const id = uid('cat');
        await tx.run('INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)',
          id, shopId, name, slug, prefix);
        categoryIds.push(id);
      }
    }

    const customerIds = [];
    const createdAt = new Date(Date.now() - 21 * 86400000).toISOString();
    for (let i = 0; i < customerNames.length; i++) {
      const id = uid('cus');
      const phone = `990009${String(i + 1).padStart(4, '0')}`;
      await tx.run(`INSERT INTO customers
        (id, shop_id, customer_code, name, phone, normalized_phone, city, state, postal_code, marketing_consent, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, shopId, `RPT-C${String(i + 1).padStart(3, '0')}`, customerNames[i], phone, phone,
      'Bengaluru', 'Karnataka', '560001', i % 2, createdAt);
      customerIds.push(id);
    }

    const products = [];
    for (let i = 0; i < 18; i++) {
      const category = Math.floor(i / 6);
      const id = uid('prd');
      const sku = `RPT-${shopId}-${String(i + 1).padStart(2, '0')}`;
      const cost = 30000 + i * 1800;
      const name = productNames[i];
      // The legacy schema requires gold-specific fields even for general ERP
      // products. They are neutral placeholders, not actual weights or purity.
      await tx.run(`INSERT INTO products
        (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g,
         making_charge_type, making_charge_value, acquisition_cost_inr, status)
        VALUES (?,?,?,?,?,'N/A',1,1,'fixed',0,?,?)`,
      id, shopId, categoryIds[category], sku, name, cost,
      i % 6 < 4 ? 'sold' : 'available');
      products.push({ id, sku, name, cost });
    }

    let revenue = 0;
    for (let i = 0; i < 12; i++) {
      // Four bills per category leave two available pieces in each inventory group.
      const category = Math.floor(i / 4);
      const product = products[category * 6 + i % 4];
      const customerId = customerIds[customerForSale[i]];
      const soldAt = new Date(Date.now() - (24 - i * 2) * 86400000).toISOString();
      const subtotal = product.cost + 8500 + i * 175;
      const tax = Math.round(subtotal * 0.03 * 100) / 100;
      const total = subtotal + tax;
      const saleId = uid('sal');
      await tx.run(`INSERT INTO sales
        (id, shop_id, invoice_no, customer_id, sold_at, subtotal_inr, tax_inr, total_inr, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,'finalized',?)`,
      saleId, shopId, `RPT-${shopId}-${String(i + 1).padStart(3, '0')}`,
      customerId, soldAt, subtotal, tax, total, soldAt);
      await tx.run(`INSERT INTO sale_items
        (id, sale_id, product_id, sku, name, purity, net_gold_weight_g, rate_24k_per_g_inr,
         gold_value_inr, making_charge_inr, tax_inr, line_total_inr)
        VALUES (?,?,?,?,?,'N/A',1,0,?,0,?,?)`,
      uid('sit'), saleId, product.id, product.sku, product.name, subtotal, tax, total);
      await tx.run(`INSERT INTO payments (id, sale_id, method, amount_inr, reference, paid_at)
        VALUES (?,?,?,?,?,?)`,
      uid('pay'), saleId, methods[i % methods.length], total, 'report demo', soldAt);
      await tx.run(`UPDATE customers SET total_spent_inr=total_spent_inr+?,
        purchase_count=purchase_count+1,
        last_purchase_at=GREATEST(COALESCE(last_purchase_at, ?), ?)
        WHERE id=?`, total, soldAt, soldAt, customerId);
      revenue += total;
    }
    return { skipped: false, products: products.length, customers: customerIds.length, sales: 12, revenue };
  });
  console.log(result.upgraded
    ? '[seed-reports] Updated only the original report samples to general ERP products.'
    : result.skipped
      ? `[seed-reports] Skipped: shop already has ${result.counts.products} products, ${result.counts.customers} customers, ${result.counts.sales} sales.`
    : `[seed-reports] Added ${result.products} products, ${result.customers} customers, ${result.sales} sales; revenue INR ${result.revenue.toFixed(2)}.`);
}

main().catch((error) => {
  console.error('[seed-reports]', error.message);
  process.exitCode = 1;
}).finally(closeDb);
