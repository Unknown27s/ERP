// Legacy pricing service — self-contained stub to decouple from packages/pricing.
function priceLine({ product = {}, rate24kPerG = 0, discountInr = 0, taxRatePct = 3 }) {
  const goldValue = Number(product.net_gold_weight_g || 0) * Number(rate24kPerG || 0);
  const making = Number(product.making_charge_value || 0);
  const subtotal = goldValue + making + Number(product.stone_value_inr || 0) + Number(product.wastage_charge_inr || 0) + Number(product.other_charges_inr || 0);
  const discount = Math.min(Number(discountInr || 0), subtotal);
  const taxable = subtotal - discount;
  const tax = (taxable * Number(taxRatePct || 0)) / 100;
  const total = taxable + tax;

  return {
    gold_value_inr: Math.round(goldValue * 100) / 100,
    making_charge_inr: Math.round(making * 100) / 100,
    stone_value_inr: Number(product.stone_value_inr || 0),
    wastage_charge_inr: Number(product.wastage_charge_inr || 0),
    other_charges_inr: Number(product.other_charges_inr || 0),
    subtotal_inr: Math.round(subtotal * 100) / 100,
    discount_inr: Math.round(discount * 100) / 100,
    taxable_inr: Math.round(taxable * 100) / 100,
    tax_inr: Math.round(tax * 100) / 100,
    line_total_inr: Math.round(total * 100) / 100,
    purity_factor: 1.0,
  };
}

module.exports = { priceLine };
