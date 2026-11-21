const express = require('express');
const { get, all, withTransaction, uid } = require('../db');
const { auth, requirePermission, requireAnyPermission, audit } = require('../middleware/auth');
const { hasPermission } = require('../services/rbac');
const { amount, quantity, priceItem, invalid } = require('../services/generic-pricing');
const router = express.Router();
router.use(auth);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const validRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stockCost = (req, rows) => {
  if (!hasPermission(req.user.permissions, 'finance.view') && !hasPermission(req.user.permissions, 'inventory.manage')) {
    for (const row of rows) delete row.acquisition_cost_inr;
  }
  return rows;
};

router.get('/products', requireAnyPermission('inventory.view', 'finance.manage'), async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
  const conds = ['p.shop_id = ?'];
  const args = [req.user.shop_id];
  if (req.query.q) { conds.push('(p.name ILIKE ? OR p.sku ILIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.status && req.query.status !== 'all') { conds.push('p.status = ?'); args.push(req.query.status); }
  const rows = await all(`SELECT p.*, c.name category_name, (p.stock_on_hand - p.stock_reserved) available_quantity
    FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${conds.join(' AND ')}
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = await get(`SELECT COUNT(*) n FROM products p WHERE ${conds.join(' AND ')}`, ...args);
  res.json({ data: stockCost(req, rows), total: total.n, page, limit });
});

router.post('/products', requirePermission('inventory.manage'), async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim() || !String(b.sku || '').trim()) invalid('Name and SKU are required');
  const price = amount(b.selling_price_inr, 'Selling price');
  const cost = amount(b.acquisition_cost_inr, 'Unit cost');
  const tax = amount(b.tax_rate_pct ?? 0, 'Tax rate');
  if (tax > 100) invalid('Tax rate cannot exceed 100%');
  const opening = b.opening_quantity == null || b.opening_quantity === 0 || b.opening_quantity === '0' ? 0 : quantity(b.opening_quantity);
  const id = uid('prd');
  await withTransaction(async (tx) => {
    if (b.category_id && !await tx.get('SELECT id FROM categories WHERE id = ? AND shop_id = ?', b.category_id, req.user.shop_id)) invalid('Invalid category');
    await tx.run(`INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g,
      making_charge_value, acquisition_cost_inr, selling_price_inr, tax_rate_pct, stock_on_hand, status)
      VALUES (?,?,?,?,?,'N/A',1,1,0,?,?,?,?, 'available')`, id, req.user.shop_id, b.category_id || null, String(b.sku).trim(), String(b.name).trim(), cost, price, tax, opening);
    if (opening) await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reference_type, reference_id, reason, actor_id)
      VALUES (?,?, 'manual_adjust',?, 'product_create',?, 'Opening stock',?)`, uid('stm'), id, opening, id, req.user.user_id);
  });
  await audit(req.user.user_id, 'product.create', 'product', id, `${b.sku}: generic item`);
  res.status(201).json({ data: await get('SELECT * FROM products WHERE id = ?', id) });
});

router.patch('/products/:id', requirePermission('inventory.manage'), async (req, res) => {
  const b = req.body || {};
  if (Object.keys(b).some((k) => !['name', 'selling_price_inr', 'tax_rate_pct'].includes(k))) invalid('Only name, selling price and tax can be edited here. Use stock intake for quantity changes.');
  const row = await withTransaction(async (tx) => {
    const current = await tx.get('SELECT * FROM products WHERE id = ? AND shop_id = ? FOR UPDATE', req.params.id, req.user.shop_id);
    if (!current) fail(404, 'Item not found');
    const price = b.selling_price_inr === undefined ? current.selling_price_inr : amount(b.selling_price_inr, 'Selling price');
    const tax = b.tax_rate_pct === undefined ? current.tax_rate_pct : amount(b.tax_rate_pct, 'Tax rate');
    if (Number(tax) > 100) invalid('Tax rate cannot exceed 100%');
    const name = String(b.name ?? current.name).trim();
    if (!name) invalid('Item name is required');
    await tx.run('UPDATE products SET name = ?, selling_price_inr = ?, tax_rate_pct = ?, updated_at = now() WHERE id = ?', name, price, tax, current.id);
    return tx.get('SELECT * FROM products WHERE id = ?', current.id);
  });
  await audit(req.user.user_id, 'product.update', 'product', row.id, 'Generic item price/tax updated');
  res.json({ data: row });
});

router.post('/purchases', requirePermission('inventory.manage'), async (req, res) => {
  const { supplier_id, supplier_invoice_no, items } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 100 || !items.every((item) => validRecord(item) && typeof item.product_id === 'string' && item.product_id.trim())) invalid('Provide 1–100 purchase lines with item IDs');
  const lines = items.map((it) => ({ ...it, quantity: quantity(it.quantity), unit_cost_inr: amount(it.unit_cost_inr, 'Unit cost') })).sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
  if (new Set(lines.map((it) => it.product_id)).size !== lines.length) invalid('Combine duplicate purchase lines');
  const id = uid('pur');
  const total = lines.reduce((sum, it) => sum + Math.round(it.unit_cost_inr * 100) * it.quantity, 0) / 100;
  amount(total, 'Purchase total');
  await withTransaction(async (tx) => {
    if (supplier_id && !await tx.get('SELECT id FROM suppliers WHERE id = ? AND shop_id = ?', supplier_id, req.user.shop_id)) invalid('Invalid supplier');
    await tx.run(`INSERT INTO purchases (id, shop_id, supplier_id, supplier_invoice_no, purchased_at, subtotal_inr, created_by)
      VALUES (?,?,?,?,now(),?,?)`, id, req.user.shop_id, supplier_id || null, supplier_invoice_no || null, total, req.user.user_id);
    for (const it of lines) {
      const product = await tx.get('SELECT * FROM products WHERE id = ? AND shop_id = ? FOR UPDATE', it.product_id, req.user.shop_id);
      if (!product) fail(404, 'Item not found');
      const cost = (Number(product.acquisition_cost_inr) * product.stock_on_hand + it.unit_cost_inr * it.quantity) / (product.stock_on_hand + it.quantity);
      await tx.run(`UPDATE products SET stock_on_hand = stock_on_hand + ?, acquisition_cost_inr = ?, status = 'available', updated_at = now() WHERE id = ?`, it.quantity, Math.round(cost * 100) / 100, product.id);
      await tx.run(`INSERT INTO purchase_items (id, purchase_id, product_id, acquisition_cost_inr, quantity) VALUES (?,?,?,?,?)`, uid('pit'), id, product.id, it.unit_cost_inr, it.quantity);
      await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reference_type, reference_id, reason, actor_id)
        VALUES (?,?, 'purchase',?, 'purchase',?, 'Stock intake',?)`, uid('stm'), product.id, it.quantity, id, req.user.user_id);
    }
  });
  await audit(req.user.user_id, 'purchase.confirm', 'purchase', id, `${lines.length} intake lines`);
  res.status(201).json({ data: await get('SELECT * FROM purchases WHERE id = ?', id) });
});

router.post('/sales/draft', requireAnyPermission('crm.manage', 'finance.manage'), async (req, res) => {
  const { customer_id, lines } = req.body || {};
  if (!Array.isArray(lines) || !lines.length || lines.length > 100 || !lines.every((line) => validRecord(line) && typeof line.product_id === 'string' && line.product_id.trim())) invalid('Provide 1–100 sale lines with item IDs');
  const ordered = lines.map((line) => ({ ...line, quantity: quantity(line.quantity) })).sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
  if (new Set(ordered.map((line) => line.product_id)).size !== ordered.length) invalid('Combine duplicate sale lines');
  const id = uid('sal');
  const data = await withTransaction(async (tx) => {
    if (customer_id && !await tx.get('SELECT id FROM customers WHERE id = ? AND shop_id = ?', customer_id, req.user.shop_id)) invalid('Invalid customer');
    await tx.run(`INSERT INTO sales (id, shop_id, invoice_no, customer_id, sold_at, subtotal_inr, total_inr, status, created_by, pricing_model)
      VALUES (?,?,?,?,now(),0,0,'draft',?,'generic')`, id, req.user.shop_id, `DRAFT-${id}`, customer_id || null, req.user.user_id);
    let subtotal = 0, tax = 0, discount = 0, total = 0;
    for (const line of ordered) {
      const item = await tx.get('SELECT * FROM products WHERE id = ? AND shop_id = ? FOR UPDATE', line.product_id, req.user.shop_id);
      if (!item || !['available', 'sold'].includes(item.status)) fail(409, 'Item is not available for generic sales');
      if (item.selling_price_inr == null) fail(409, `${item.sku}: set a selling price in inventory first`);
      if (item.stock_on_hand - item.stock_reserved < line.quantity) fail(409, `${item.sku}: insufficient stock`);
      const calc = priceItem({ ...line, unit_price_inr: item.selling_price_inr, tax_rate_pct: item.tax_rate_pct });
      subtotal += Math.round(calc.subtotal_inr * 100); tax += Math.round(calc.tax_inr * 100); discount += Math.round(calc.discount_inr * 100); total += Math.round(calc.line_total_inr * 100);
      await tx.run('UPDATE products SET stock_reserved = stock_reserved + ? WHERE id = ?', line.quantity, item.id);
      await tx.run(`INSERT INTO sale_items (id, sale_id, product_id, sku, name, purity, net_gold_weight_g, rate_24k_per_g_inr, gold_value_inr, making_charge_inr,
        quantity, unit_price_inr, tax_rate_pct, discount_inr, tax_inr, line_total_inr, unit_cost_inr)
        VALUES (?,?,?,?,?,'N/A',0,0,0,0,?,?,?,?,?,?,?)`, uid('sit'), id, item.id, item.sku, item.name, line.quantity, item.selling_price_inr, item.tax_rate_pct, calc.discount_inr, calc.tax_inr, calc.line_total_inr, item.acquisition_cost_inr);
    }
    amount(total / 100, 'Sale total');
    await tx.run('UPDATE sales SET subtotal_inr = ?, tax_inr = ?, discount_inr = ?, total_inr = ? WHERE id = ?', subtotal / 100, tax / 100, discount / 100, total / 100, id);
    return tx.get('SELECT * FROM sales WHERE id = ?', id);
  });
  await audit(req.user.user_id, 'sale.draft', 'sale', id, 'Generic stock reserved');
  res.status(201).json({ data });
});

router.post('/sales/:id/finalize', requireAnyPermission('crm.manage', 'finance.manage'), async (req, res) => {
  const payments = req.body?.payments;
  if (!Array.isArray(payments) || !payments.length || payments.length > 10 || !payments.every(validRecord)) invalid('Provide 1–10 payments');
  const paid = payments.reduce((sum, p) => {
    if (!['cash', 'upi', 'card', 'bank_transfer'].includes(p.method)) invalid('Invalid payment method');
    const value = amount(p.amount_inr, 'Payment');
    if (value <= 0) invalid('Payment must be positive');
    return sum + Math.round(value * 100);
  }, 0);
  const data = await withTransaction(async (tx) => {
    const sale = await tx.get('SELECT * FROM sales WHERE id = ? AND shop_id = ? FOR UPDATE', req.params.id, req.user.shop_id);
    if (!sale) fail(404, 'Sale not found');
    if (sale.status !== 'draft' || sale.pricing_model !== 'generic') fail(409, 'Only generic draft sales can be finalized');
    if (paid !== Math.round(sale.total_inr * 100)) invalid('Payments must exactly match the invoice total');
    const items = await tx.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY product_id', sale.id);
    if (!items.length) fail(409, 'Draft is empty');
    for (const line of items) {
      const product = await tx.get('SELECT * FROM products WHERE id = ? AND shop_id = ? FOR UPDATE', line.product_id, req.user.shop_id);
      if (!product || product.stock_reserved < line.quantity || product.stock_on_hand < line.quantity) fail(409, 'Stock reservation is missing');
      await tx.run(`UPDATE products SET stock_on_hand = stock_on_hand - ?, stock_reserved = stock_reserved - ?, updated_at = now() WHERE id = ?`, line.quantity, line.quantity, product.id);
      await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reference_type, reference_id, reason, actor_id)
        VALUES (?,?, 'sale',?, 'sale',?, 'Finalized generic sale',?)`, uid('stm'), product.id, -line.quantity, sale.id, req.user.user_id);
    }
    await tx.get('SELECT pg_advisory_xact_lock(?)', 727002);
    const invoice = `INV-${new Date().getFullYear()}-${sale.id.slice(4).toUpperCase()}`;
    await tx.run(`UPDATE sales SET invoice_no = ?, status = 'finalized', sold_at = now() WHERE id = ?`, invoice, sale.id);
    for (const payment of payments) await tx.run('INSERT INTO payments (id, sale_id, method, amount_inr, reference) VALUES (?,?,?,?,?)', uid('pay'), sale.id, payment.method, amount(payment.amount_inr), payment.reference || null);
    if (sale.customer_id) await tx.run(`UPDATE customers SET total_spent_inr = total_spent_inr + ?, purchase_count = purchase_count + 1, last_purchase_at = now() WHERE id = ? AND shop_id = ?`, sale.total_inr, sale.customer_id, req.user.shop_id);
    return tx.get('SELECT * FROM sales WHERE id = ?', sale.id);
  });
  await audit(req.user.user_id, 'sale.finalize', 'sale', data.id, data.invoice_no);
  res.json({ data });
});

async function releaseSale(req, expectedStatus) {
  return withTransaction(async (tx) => {
    const sale = await tx.get('SELECT * FROM sales WHERE id = ? AND shop_id = ? FOR UPDATE', req.params.id, req.user.shop_id);
    if (!sale) fail(404, 'Sale not found');
    if (sale.pricing_model !== 'generic' || sale.status !== expectedStatus) fail(409, `Only ${expectedStatus} generic sales support this action`);
    const items = await tx.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY product_id', sale.id);
    for (const line of items) {
      await tx.get('SELECT id FROM products WHERE id = ? AND shop_id = ? FOR UPDATE', line.product_id, req.user.shop_id);
      if (expectedStatus === 'draft') await tx.run('UPDATE products SET stock_reserved = stock_reserved - ? WHERE id = ?', line.quantity, line.product_id);
      else {
        await tx.run(`UPDATE products SET stock_on_hand = stock_on_hand + ?, status = 'available' WHERE id = ?`, line.quantity, line.product_id);
        await tx.run(`INSERT INTO returns_refunds (id, sale_id, sale_item_id, reason, refund_amount_inr, restock, created_by) VALUES (?,?,?,?,?,1,?)`, uid('ret'), sale.id, line.id, req.body.reason, line.line_total_inr, req.user.user_id);
        await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reference_type, reference_id, reason, actor_id) VALUES (?,?,'return',?,'sale',?,?,?)`, uid('stm'), line.product_id, line.quantity, sale.id, req.body.reason, req.user.user_id);
      }
    }
    if (expectedStatus === 'finalized' && sale.customer_id) await tx.run('UPDATE customers SET total_spent_inr = GREATEST(0,total_spent_inr - ?), purchase_count = GREATEST(0,purchase_count - 1) WHERE id = ? AND shop_id = ?', sale.total_inr, sale.customer_id, req.user.shop_id);
    await tx.run('UPDATE sales SET status = ? WHERE id = ?', expectedStatus === 'draft' ? 'cancelled' : 'voided', sale.id);
    return tx.get('SELECT * FROM sales WHERE id = ?', sale.id);
  });
}
router.post('/sales/:id/cancel', requireAnyPermission('crm.manage', 'finance.manage'), async (req, res) => {
  const data = await releaseSale(req, 'draft');
  await audit(req.user.user_id, 'sale.cancel', 'sale', data.id, 'Draft reservation released');
  res.json({ data });
});
router.post('/sales/:id/void', requirePermission('finance.manage'), async (req, res) => {
  if (!String(req.body?.reason || '').trim()) invalid('Refund reason is required');
  const data = await releaseSale(req, 'finalized');
  await audit(req.user.user_id, 'sale.void', 'sale', data.id, req.body.reason);
  res.json({ data });
});

router.get('/finance/summary', requirePermission('finance.view'), async (req, res) => {
  const sales = await get(`SELECT COALESCE(SUM(total_inr),0) receipts, COALESCE(SUM(tax_inr),0) tax FROM sales WHERE shop_id = ? AND status = 'finalized'`, req.user.shop_id);
  const expenses = await get('SELECT COALESCE(SUM(amount_inr),0) expenses FROM expenses WHERE shop_id = ?', req.user.shop_id);
  res.json({ data: { ...sales, ...expenses, net_cash: Number(sales.receipts) - Number(expenses.expenses) } });
});
router.post('/purchases/:id/pay', requirePermission('finance.manage'), async (req, res) => {
  const data = await withTransaction(async (tx) => {
    const purchase = await tx.get('SELECT * FROM purchases WHERE id = ? AND shop_id = ? FOR UPDATE', req.params.id, req.user.shop_id);
    if (!purchase) fail(404, 'Purchase not found');
    if (purchase.payment_status === 'paid') fail(409, 'Purchase is already paid');
    await tx.run(`INSERT INTO expenses (id, shop_id, category, amount_inr, spent_at, note, created_by) VALUES (?,?,'supplier_payment',?,now(),?,?)`, uid('exp'), req.user.shop_id, purchase.subtotal_inr, `Purchase ${purchase.id} (${purchase.supplier_invoice_no || 'no supplier reference'})`, req.user.user_id);
    await tx.run("UPDATE purchases SET payment_status = 'paid' WHERE id = ?", purchase.id);
    return tx.get('SELECT * FROM purchases WHERE id = ?', purchase.id);
  });
  await audit(req.user.user_id, 'purchase.pay', 'purchase', data.id, 'Supplier payment recorded as expense');
  res.json({ data });
});
router.get('/finance/expenses', requirePermission('finance.view'), async (req, res) => {
  res.json({ data: await all('SELECT * FROM expenses WHERE shop_id = ? ORDER BY spent_at DESC LIMIT 200', req.user.shop_id) });
});
router.post('/finance/expenses', requirePermission('finance.manage'), async (req, res) => {
  const b = req.body || {};
  const value = amount(b.amount_inr);
  if (value <= 0 || !String(b.category || '').trim()) invalid('Category and positive amount are required');
  const id = uid('exp');
  await withTransaction((tx) => tx.run(`INSERT INTO expenses (id, shop_id, category, amount_inr, spent_at, note, created_by) VALUES (?,?,?,?,now(),?,?)`, id, req.user.shop_id, String(b.category).trim(), value, b.note || null, req.user.user_id));
  await audit(req.user.user_id, 'finance.expense.create', 'expense', id, `${b.category}: ${value}`);
  res.status(201).json({ data: await get('SELECT * FROM expenses WHERE id = ?', id) });
});
module.exports = router;
