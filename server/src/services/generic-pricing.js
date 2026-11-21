function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
function amount(value, name = 'Amount') {
  if (value == null || !['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) invalid(`${name} is required`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e10 || Math.abs(n * 100 - Math.round(n * 100)) > 0.0001) invalid(`${name} must be a nonnegative amount with at most two decimals`);
  return Math.round(n * 100) / 100;
}
function quantity(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) invalid('Quantity is required');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000000) invalid('Quantity must be an integer between 1 and 1000000');
  return n;
}
function priceItem({ unit_price_inr, quantity: qty, tax_rate_pct = 0, discount_inr = 0 }) {
  const unit = amount(unit_price_inr, 'Unit price');
  const count = quantity(qty);
  const taxRate = amount(tax_rate_pct, 'Tax rate');
  if (taxRate > 100) invalid('Tax rate cannot exceed 100%');
  const discount = Math.round(amount(discount_inr, 'Discount') * 100);
  const subtotal = Math.round(unit * 100) * count;
  if (!Number.isSafeInteger(subtotal) || subtotal > 1e12) invalid('Line total is too large');
  if (discount > subtotal) invalid('Discount cannot exceed the line subtotal');
  const tax = Math.round((subtotal - discount) * taxRate / 100);
  return { subtotal_inr: subtotal / 100, discount_inr: discount / 100, tax_inr: tax / 100, line_total_inr: (subtotal - discount + tax) / 100 };
}
module.exports = { amount, quantity, priceItem, invalid };
