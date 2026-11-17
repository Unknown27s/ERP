-- 0011 (Postgres): Employee Self-Service (ESS), task completion tracking, work sessions,
-- profile pictures, and workflow foundation.
--
-- Safe to run once per database: db.js records applied migrations in schema_migrations.

-- 1. Profile Picture & Avatar Support
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cost_centre TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Enhanced Role metadata & Multi-role mapping
ALTER TABLE roles ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_sensitive INTEGER NOT NULL DEFAULT 0;

-- Assign canonical codes to existing standard roles
UPDATE roles SET code = 'ADM', is_sensitive = 1 WHERE name = 'Administrator' AND code IS NULL;
UPDATE roles SET code = 'DM' WHERE name = 'Manager' AND code IS NULL;
UPDATE roles SET code = 'HR' WHERE name = 'HR' AND code IS NULL;
UPDATE roles SET code = 'FIN', is_sensitive = 1 WHERE name = 'Finance' AND code IS NULL;
UPDATE roles SET code = 'EMP' WHERE name = 'Employee' AND code IS NULL;
UPDATE roles SET code = 'Store' WHERE name = 'Store' AND code IS NULL;
UPDATE roles SET code = 'Sales' WHERE name = 'Sales' AND code IS NULL;

-- Multi-Role Assignment Support
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES profiles(user_id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- Backfill user_roles from existing profiles.role_id
INSERT INTO user_roles (user_id, role_id, granted_at)
SELECT user_id, role_id, now() FROM profiles
WHERE role_id IS NOT NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- 3. Scoped Permissions Columns (for Phase 3 RBAC)
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'view';
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all';

-- 4. Hourly Work Log & Clock In/Out Sessions
CREATE TABLE IF NOT EXISTS employee_work_sessions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_sessions_emp_date ON employee_work_sessions(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_sessions_shop_date ON employee_work_sessions(shop_id, work_date);

-- 5. Tasks Completed Log (Daily Work Log with Tags)
CREATE TABLE IF NOT EXISTS employee_tasks (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  task_title TEXT NOT NULL,
  description TEXT,
  tag TEXT NOT NULL DEFAULT 'general', -- e.g., 'development', 'bugfix', 'client-meeting', 'support', 'review', 'documentation'
  hours_spent DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'in_progress', 'blocked'
  project_or_lead_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_emp_date ON employee_tasks(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_employee_tasks_tag ON employee_tasks(shop_id, tag);

-- 6. Role Provisioning & Workflow Foundation
CREATE TABLE IF NOT EXISTS approval_rules (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  request_type TEXT NOT NULL,        -- 'leave', 'expense', 'purchase', 'new_hire', 'promotion', 'privileged_role'
  min_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_amount DOUBLE PRECISION,
  level INTEGER NOT NULL DEFAULT 1,
  approver_role_code TEXT NOT NULL,
  escalation_hours INTEGER NOT NULL DEFAULT 48,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  approver_user_id TEXT NOT NULL REFERENCES profiles(user_id),
  backup_user_id TEXT NOT NULL REFERENCES profiles(user_id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
