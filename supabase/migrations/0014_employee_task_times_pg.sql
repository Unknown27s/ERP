-- Optional timing for completed tasks. Existing task logs retain their
-- recorded hours and remain readable with NULL start/end timestamps.
ALTER TABLE employee_tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE employee_tasks ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE employee_tasks ADD CONSTRAINT employee_task_time_order
  CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at > started_at);
