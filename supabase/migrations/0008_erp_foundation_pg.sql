-- 0008 (Postgres): ERP foundation — Phase 1
-- Roles, granular permissions, user ↔ role links, department/designation
-- activation (soft delete) and audit indexes.
--
-- Safe to run once per database: db.js records applied migrations in
-- schema_migrations. The data statements are idempotent so they can also be
-- pasted into the Supabase SQL editor by hand.

-- ---------------------------------------------------------------- permissions
CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  label TEXT NOT NULL
);

INSERT INTO permissions (key, module, label) VALUES
  ('staff.view',       'Staff',     'View users, roles and org structure'),
  ('staff.manage',     'Staff',     'Create, edit and deactivate users'),
  ('roles.manage',     'Staff',     'Create roles and change permissions'),
  ('company.manage',   'Settings',  'Edit company profile and settings'),
  ('hr.view',          'HR',        'View employees and HR records'),
  ('hr.manage',        'HR',        'Create and edit employees and HR records'),
  ('leave.view',       'Leave',     'View leave requests and balances'),
  ('leave.manage',     'Leave',     'Create and edit leave policies'),
  ('leave.approve',    'Leave',     'Approve or reject leave requests'),
  ('finance.view',     'Finance',   'View ledgers, invoices and reports'),
  ('finance.manage',   'Finance',   'Post journals, invoices and payments'),
  ('inventory.view',   'Inventory', 'View items, stock and purchases'),
  ('inventory.manage', 'Inventory', 'Create items, purchase orders and movements'),
  ('crm.view',         'CRM',       'View leads, customers and support cases'),
  ('crm.manage',       'CRM',       'Create and edit leads, customers and orders'),
  ('payroll.view',     'Payroll',   'View salary structures and payslips'),
  ('payroll.manage',   'Payroll',   'Run payroll and post salary journals'),
  ('reports.view',     'Reports',   'View management reports and dashboards'),
  ('audit.view',       'Audit',     'View the audit trail')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------- roles
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_shop ON roles(shop_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id);

-- Every shop gets the same starting role set. Deterministic IDs keep the
-- migration idempotent and let role_permissions resolve them by name.
INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':Administrator'), 1, 20), s.id,
       'Administrator', 'Full access to every module', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':Manager'), 1, 20), s.id,
       'Manager', 'Runs day-to-day operations and approves requests', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':HR'), 1, 20), s.id,
       'HR', 'Employee lifecycle, leave and payroll', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':Finance'), 1, 20), s.id,
       'Finance', 'Books, invoices, payments and reports', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':Store'), 1, 20), s.id,
       'Store', 'Items, purchasing and stock movements', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':Sales'), 1, 20), s.id,
       'Sales', 'Leads, customers and sales orders', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO roles (id, shop_id, name, description, is_system)
SELECT 'role_' || substr(md5(s.id || ':Employee'), 1, 20), s.id,
       'Employee', 'Self-service: own details and leave requests', 1 FROM shops s
ON CONFLICT (shop_id, name) DO NOTHING;

-- ------------------------------------------------------- role → permission map
-- Administrator: everything.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Administrator'
ON CONFLICT DO NOTHING;

-- Manager: view everything, manage operations, approve leave.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Manager' AND p.key IN (
  'staff.view', 'company.manage',
  'hr.view', 'hr.manage', 'leave.view', 'leave.manage', 'leave.approve',
  'finance.view', 'inventory.view', 'inventory.manage',
  'crm.view', 'crm.manage', 'payroll.view', 'reports.view', 'audit.view'
)
ON CONFLICT DO NOTHING;

-- HR: people, leave, payroll.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'HR' AND p.key IN (
  'staff.view', 'hr.view', 'hr.manage', 'leave.view', 'leave.manage',
  'leave.approve', 'payroll.view', 'payroll.manage', 'reports.view'
)
ON CONFLICT DO NOTHING;

-- Finance: books and reports.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Finance' AND p.key IN (
  'finance.view', 'finance.manage', 'inventory.view',
  'payroll.view', 'reports.view', 'audit.view'
)
ON CONFLICT DO NOTHING;

-- Store: inventory.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Store' AND p.key IN ('inventory.view', 'inventory.manage', 'reports.view')
ON CONFLICT DO NOTHING;

-- Sales: CRM.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Sales' AND p.key IN ('crm.view', 'crm.manage', 'inventory.view', 'reports.view')
ON CONFLICT DO NOTHING;

-- Employee: self-service only.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Employee' AND p.key IN ('leave.view', 'hr.view')
ON CONFLICT DO NOTHING;

-- Link existing accounts to the equivalent role.
UPDATE profiles SET role_id = (
  SELECT r.id FROM roles r WHERE r.shop_id = profiles.shop_id AND r.name = 'Administrator'
) WHERE profiles.role = 'admin' AND profiles.role_id IS NULL;

UPDATE profiles SET role_id = (
  SELECT r.id FROM roles r WHERE r.shop_id = profiles.shop_id AND r.name = 'Sales'
) WHERE profiles.role = 'billing' AND profiles.role_id IS NULL;

-- ------------------------------------------- organisation structure soft delete
ALTER TABLE departments ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE designations ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;

-- --------------------------------------------------------------- audit trail
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_logs(actor_id, created_at DESC);
