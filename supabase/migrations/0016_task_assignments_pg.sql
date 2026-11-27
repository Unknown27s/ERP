-- Assigned work is separate from the existing timed employee work log.
CREATE TABLE IF NOT EXISTS task_assignments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  assigned_to TEXT NOT NULL REFERENCES profiles(user_id),
  assigned_by TEXT NOT NULL REFERENCES profiles(user_id),
  due_date TEXT CHECK (due_date IS NULL OR due_date ~ '^\d{4}-\d{2}-\d{2}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed')),
  progress_note TEXT NOT NULL DEFAULT '' CHECK (length(progress_note) <= 2000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_task_assignments_person ON task_assignments(shop_id, assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_assignments_team ON task_assignments(shop_id, status, created_at DESC);
