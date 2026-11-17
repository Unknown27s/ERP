-- 0012 (Postgres): Security hardening — audit metadata, task soft-delete, token versioning,
-- and revocation of hr.view from default Employee role.

-- 1. Soft-delete support on employee_tasks
ALTER TABLE employee_tasks ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_employee_tasks_active ON employee_tasks(employee_id, active, work_date);

-- 2. Audit log security enhancements
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS shop_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 3. Token versioning for revocation on logout/password reset
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- 4. Revoke hr.view from default Employee role (C3 fix in live DB)
DELETE FROM role_permissions
WHERE permission_key = 'hr.view'
  AND role_id IN (SELECT id FROM roles WHERE name = 'Employee');
