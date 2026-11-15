-- 0009 (Postgres): soft-delete support for holidays.
-- Business records are deactivated, never hard-deleted. Existing holidays stay
-- active; removing one now sets active = 0 and keeps the audit trail intact.

ALTER TABLE holidays ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_holidays_shop_active ON holidays(shop_id, active);
