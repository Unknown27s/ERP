-- Additive generic commerce. Historical prices/invoices remain unchanged.
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price_inr NUMERIC(14,2) CHECK (selling_price_inr >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate_pct BETWEEN 0 AND 100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0 AND stock_reserved <= stock_on_hand);
UPDATE products SET stock_on_hand = 1 WHERE status IN ('available','reserved');
ALTER TABLE sales ADD COLUMN IF NOT EXISTS pricing_model TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_price_inr NUMERIC(14,2) CHECK (unit_price_inr >= 0);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate_pct BETWEEN 0 AND 100);
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost_inr NUMERIC(14,2) CHECK (unit_cost_inr >= 0);

-- Self-service requires authentication and an employee link, not HR permissions.
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name = 'Employee' AND is_system = 1)
  AND permission_key IN ('leave.view', 'hr.view');
