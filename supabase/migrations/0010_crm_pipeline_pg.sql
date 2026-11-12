-- 0010 (Postgres): Phase 2 CRM pipeline.
--
-- Adds the missing CRM objects called out in the build spec: leads with a
-- pipeline stage, activities/follow-ups tied to a lead or a customer, and
-- support cases. Business rows are deactivated (`active = 0`) rather than
-- hard-deleted; status fields carry the lifecycle.
--
-- No foreign keys are declared to match the inherited schema style. Tenant
-- scoping (`shop_id`) is enforced by every API query.

CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  lead_code TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  normalized_phone TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  stage TEXT NOT NULL DEFAULT 'new',
  estimated_value_inr DOUBLE PRECISION NOT NULL DEFAULT 0,
  owner_user_id TEXT,
  customer_id TEXT,
  notes TEXT,
  next_follow_up_on TEXT,
  lost_reason TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_leads_code ON crm_leads(shop_id, lead_code);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(shop_id, stage, active);
CREATE INDEX IF NOT EXISTS idx_crm_leads_followup ON crm_leads(shop_id, next_follow_up_on);
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone ON crm_leads(shop_id, normalized_phone);

CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  lead_id TEXT,
  customer_id TEXT,
  kind TEXT NOT NULL DEFAULT 'note',
  subject TEXT NOT NULL,
  notes TEXT,
  due_on TEXT,
  done_at TIMESTAMPTZ,
  outcome TEXT,
  created_by TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(shop_id, lead_id, active);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON crm_activities(shop_id, customer_id, active);
CREATE INDEX IF NOT EXISTS idx_crm_activities_due ON crm_activities(shop_id, due_on);

CREATE TABLE IF NOT EXISTS crm_support_cases (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  case_code TEXT NOT NULL,
  customer_id TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to TEXT,
  opened_by TEXT,
  resolved_at TIMESTAMPTZ,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_cases_code ON crm_support_cases(shop_id, case_code);
CREATE INDEX IF NOT EXISTS idx_crm_cases_status ON crm_support_cases(shop_id, status, active);
CREATE INDEX IF NOT EXISTS idx_crm_cases_customer ON crm_support_cases(shop_id, customer_id);
