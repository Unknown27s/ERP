/**
 * Phase 2 — CRM pipeline.
 *
 * Leads, follow-up activities and support cases for the single company. Every
 * route is tenant-scoped by `req.user.shop_id` and guarded by `crm.view` /
 * `crm.manage`; the SPA only mirrors those checks for convenience.
 *
 * Records are never hard-deleted: leads, activities and cases are archived with
 * `active = 0` and remain available to the audit trail/reporting.
 */
const express = require('express');
const { get, all, run, withTransaction, uid } = require('../db');
const { auth, requirePermission, audit } = require('../middleware/auth');
const { normalizePhone, isValidPhone } = require('../services/phone');
const { today } = require('../services/date');

const router = express.Router();
router.use(auth);

const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
const ACTIVITY_KINDS = ['call', 'meeting', 'email', 'note', 'task', 'whatsapp'];
const CASE_STATUSES = ['open', 'pending', 'resolved', 'closed'];
const CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const bad = (res, message) => res.status(400).json({ error: 'bad_request', message });
const pageArgs = (page, limit) => {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  return { page: p, limit: l, offset: (p - 1) * l };
};

function optionalDate(value, field) {
  if (value === null || value === undefined || value === '') return { value: null };
  if (typeof value !== 'string' || !DATE_RE.test(value)) return { error: `${field} must be YYYY-MM-DD` };
  return { value };
}

/** Add days to a date-only string without crossing time zones. */
function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function optionalEmail(value) {
  if (!value) return { value: null };
  const em = String(value).toLowerCase().trim();
  return EMAIL_RE.test(em) ? { value: em } : { error: 'email looks invalid' };
}

async function activeProfile(shopId, userId) {
  if (!userId) return null;
  return get('SELECT user_id FROM profiles WHERE user_id = ? AND shop_id = ? AND active = 1', userId, shopId);
}

async function nextCode(shopId, table, prefix) {
  const row = await get(`SELECT COUNT(*)::int AS n FROM ${table} WHERE shop_id = ?`, shopId);
  return `${prefix}${String(Number(row?.n || 0) + 1).padStart(5, '0')}`;
}

// ---------------------------------------------------------------- dashboard
router.get('/crm/pipeline', requirePermission('crm.view'), async (req, res) => {
  const shop = req.user.shop_id;
  const date = today();
  const stages = await all(
    `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(estimated_value_inr), 0) AS value_inr
     FROM crm_leads WHERE shop_id = ? AND active = 1 GROUP BY stage`,
    shop
  );
  const byStage = Object.fromEntries(LEAD_STAGES.map((s) => [s, { stage: s, count: 0, value_inr: 0 }]));
  for (const row of stages) byStage[row.stage] = row;

  const overdueLeads = await get(
    `SELECT COUNT(*)::int AS n FROM crm_leads
     WHERE shop_id = ? AND active = 1 AND stage NOT IN ('won','lost')
       AND next_follow_up_on IS NOT NULL AND next_follow_up_on < ?`,
    shop, date
  );
  const openActivities = await get(
    `SELECT COUNT(*)::int AS n FROM crm_activities
     WHERE shop_id = ? AND active = 1 AND done_at IS NULL AND due_on IS NOT NULL AND due_on < ?`,
    shop, date
  );
  const cases = await all(
    `SELECT status, COUNT(*)::int AS count FROM crm_support_cases
     WHERE shop_id = ? AND active = 1 GROUP BY status`,
    shop
  );
  const byCaseStatus = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0]));
  for (const row of cases) byCaseStatus[row.status] = row.count;

  res.json({
    data: {
      as_of: date,
      leads: { by_stage: LEAD_STAGES.map((s) => byStage[s]), overdue_follow_ups: overdueLeads?.n || 0 },
      activities: { overdue_open: openActivities?.n || 0 },
      support_cases: { by_status: byCaseStatus, open: (byCaseStatus.open || 0) + (byCaseStatus.pending || 0) },
    },
  });
});

// -------------------------------------------------------------------- leads
router.get('/leads', requirePermission('crm.view'), async (req, res) => {
  const { q, stage, owner, due, include_inactive, page, limit } = req.query;
  const { page: p, limit: l, offset } = pageArgs(page, limit);
  const conds = ['l.shop_id = ?'];
  const args = [req.user.shop_id];

  if (!(include_inactive === '1' || include_inactive === 'true')) conds.push('l.active = 1');
  if (q) {
    conds.push('(l.name LIKE ? OR l.company LIKE ? OR l.phone LIKE ? OR l.normalized_phone LIKE ? OR l.email LIKE ? OR l.lead_code LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, `%${normalizePhone(q) || q}%`, like, like);
  }
  if (stage) {
    if (!LEAD_STAGES.includes(stage)) return bad(res, `stage must be one of: ${LEAD_STAGES.join(', ')}`);
    conds.push('l.stage = ?'); args.push(stage);
  }
  if (owner === 'me') { conds.push('l.owner_user_id = ?'); args.push(req.user.user_id); }
  else if (owner) { conds.push('l.owner_user_id = ?'); args.push(owner); }

  const date = today();
  if (due === 'overdue') { conds.push('l.next_follow_up_on IS NOT NULL AND l.next_follow_up_on < ?'); args.push(date); }
  if (due === 'today') { conds.push('l.next_follow_up_on = ?'); args.push(date); }
  if (due === 'week') { conds.push('l.next_follow_up_on BETWEEN ? AND ?'); args.push(date, addDays(date, 7)); }

  const where = conds.join(' AND ');
  const rows = await all(
    `SELECT l.*, p.display_name AS owner_name, c.name AS customer_name
     FROM crm_leads l
     LEFT JOIN profiles p ON p.user_id = l.owner_user_id
     LEFT JOIN customers c ON c.id = l.customer_id
     WHERE ${where}
     ORDER BY l.active DESC, l.next_follow_up_on NULLS LAST, l.updated_at DESC
     LIMIT ? OFFSET ?`,
    ...args, l, offset
  );
  const total = await get(`SELECT COUNT(*)::int AS n FROM crm_leads l WHERE ${where}`, ...args);
  res.json({ data: rows, total: total?.n || 0, page: p, limit: l });
});

router.post('/leads', requirePermission('crm.manage'), async (req, res) => {
  const b = req.body || {};
  if (!String(b.name ?? '').trim()) return bad(res, 'name is required');
  if (b.stage && !LEAD_STAGES.includes(b.stage)) return bad(res, `stage must be one of: ${LEAD_STAGES.join(', ')}`);
  const email = optionalEmail(b.email);
  if (email.error) return bad(res, email.error);
  const followUp = optionalDate(b.next_follow_up_on, 'next_follow_up_on');
  if (followUp.error) return bad(res, followUp.error);
  if (b.phone && !isValidPhone(b.phone)) return bad(res, 'phone number looks invalid');
  const ownerId = b.owner_user_id || req.user.user_id;
  if (!(await activeProfile(req.user.shop_id, ownerId))) return bad(res, 'owner must be an active user in this company');
  const value = Number(b.estimated_value_inr ?? 0);
  if (!Number.isFinite(value) || value < 0) return bad(res, 'estimated_value_inr must be zero or more');

  const id = uid('lead');
  const code = await nextCode(req.user.shop_id, 'crm_leads', 'L');
  await run(
    `INSERT INTO crm_leads
       (id, shop_id, lead_code, name, company, email, phone, normalized_phone, source, stage,
        estimated_value_inr, owner_user_id, notes, next_follow_up_on, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, code, String(b.name).trim(), b.company || null, email.value,
    b.phone || null, b.phone ? normalizePhone(b.phone) : null, b.source || 'manual',
    b.stage || 'new', value, ownerId, b.notes || null, followUp.value, req.user.user_id
  );
  await audit(req.user.user_id, 'crm.lead.create', 'crm_lead', id, `${code} ${b.name} (${b.stage || 'new'})`);
  res.status(201).json({ data: await get('SELECT * FROM crm_leads WHERE id = ?', id) });
});

router.get('/leads/:id', requirePermission('crm.view'), async (req, res) => {
  const lead = await get(
    `SELECT l.*, p.display_name AS owner_name, c.name AS customer_name
     FROM crm_leads l
     LEFT JOIN profiles p ON p.user_id = l.owner_user_id
     LEFT JOIN customers c ON c.id = l.customer_id
     WHERE l.id = ? AND l.shop_id = ?`,
    req.params.id, req.user.shop_id
  );
  if (!lead) return res.status(404).json({ error: 'not_found' });
  const activities = await all(
    `SELECT a.*, p.display_name AS created_by_name FROM crm_activities a
     LEFT JOIN profiles p ON p.user_id = a.created_by
     WHERE a.lead_id = ? AND a.shop_id = ? AND a.active = 1
     ORDER BY a.done_at NULLS FIRST, a.due_on NULLS LAST, a.created_at DESC`,
    lead.id, req.user.shop_id
  );
  res.json({ data: { ...lead, activities } });
});

router.patch('/leads/:id', requirePermission('crm.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM crm_leads WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const allowed = ['name', 'company', 'email', 'phone', 'source', 'stage', 'estimated_value_inr',
    'owner_user_id', 'notes', 'next_follow_up_on', 'lost_reason'];
  const sets = [];
  const args = [];

  for (const key of allowed) if (b[key] !== undefined) {
    let value = b[key];
    if (key === 'name' && !String(value ?? '').trim()) return bad(res, 'name cannot be empty');
    if (key === 'stage') {
      if (!LEAD_STAGES.includes(value)) return bad(res, `stage must be one of: ${LEAD_STAGES.join(', ')}`);
      if (value === 'won' && !cur.customer_id) {
        return res.status(400).json({ error: 'bad_request', message: 'use POST /leads/:id/convert to win a lead' });
      }
    }
    if (key === 'email') {
      const email = optionalEmail(value);
      if (email.error) return bad(res, email.error);
      value = email.value;
    }
    if (key === 'next_follow_up_on') {
      const date = optionalDate(value, key);
      if (date.error) return bad(res, date.error);
      value = date.value;
    }
    if (key === 'phone') {
      if (value && !isValidPhone(value)) return bad(res, 'phone number looks invalid');
      sets.push('normalized_phone = ?');
      args.push(value ? normalizePhone(value) : null);
    }
    if (key === 'estimated_value_inr') {
      value = Number(value);
      if (!Number.isFinite(value) || value < 0) return bad(res, 'estimated_value_inr must be zero or more');
    }
    if (key === 'owner_user_id' && value) {
      if (!(await activeProfile(req.user.shop_id, value))) return bad(res, 'owner must be an active user in this company');
    }
    sets.push(`${key} = ?`); args.push(value === '' ? null : value);
  }

  if (!sets.length) return bad(res, 'no editable fields supplied');
  sets.push('updated_at = now()');
  args.push(cur.id);
  await run(`UPDATE crm_leads SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await audit(req.user.user_id, 'crm.lead.update', 'crm_lead', cur.id, `${cur.lead_code} updated: ${Object.keys(b).join(', ')}`);
  res.json({ data: await get('SELECT * FROM crm_leads WHERE id = ?', cur.id) });
});

router.delete('/leads/:id', requirePermission('crm.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM crm_leads WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (!cur.active) return res.json({ data: { id: cur.id, deactivated: true } });
  await run('UPDATE crm_leads SET active = 0, updated_at = now() WHERE id = ?', cur.id);
  await audit(req.user.user_id, 'crm.lead.archive', 'crm_lead', cur.id, `${cur.lead_code} archived`);
  res.json({ data: { id: cur.id, deactivated: true } });
});

// Convert a lead into a customer. Customer records still require a complete
// postal address, so the conversion request supplies the missing address.
router.post('/leads/:id/convert', requirePermission('crm.manage'), async (req, res) => {
  const shop = req.user.shop_id;
  const lead = await get('SELECT * FROM crm_leads WHERE id = ? AND shop_id = ?', req.params.id, shop);
  if (!lead) return res.status(404).json({ error: 'not_found' });
  if (!lead.active) return bad(res, 'lead is archived');
  if (lead.customer_id) {
    return res.status(409).json({
      error: 'already_converted',
      message: 'This lead is already linked to a customer',
      customer_id: lead.customer_id,
    });
  }

  const b = req.body || {};
  const phone = b.phone || lead.phone;
  const fields = {
    name: b.name || lead.name,
    phone,
    email: b.email || lead.email,
    address_line1: b.address_line1,
    city: b.city,
    state: b.state,
    postal_code: b.postal_code,
  };
  const missing = ['name', 'phone', 'address_line1', 'city', 'state', 'postal_code']
    .filter((key) => !String(fields[key] ?? '').trim());
  if (missing.length) {
    return res.status(400).json({
      error: 'bad_request',
      message: `Missing required fields to create the customer: ${missing.join(', ')}`,
      fields: missing,
    });
  }
  if (!isValidPhone(fields.phone)) return bad(res, 'phone number looks invalid');
  const norm = normalizePhone(fields.phone);
  const duplicates = await all(
    'SELECT * FROM customers WHERE shop_id = ? AND (normalized_phone = ? OR phone = ?)',
    shop, norm, fields.phone
  );
  if (duplicates.length) {
    return res.status(409).json({
      error: 'duplicate',
      message: 'Phone already exists — link the existing customer instead of creating a duplicate.',
      data: duplicates,
    });
  }

  const result = await withTransaction(async (tx) => {
    const count = await tx.get('SELECT COUNT(*)::int AS n FROM customers WHERE shop_id = ?', shop);
    const code = `C${String(Number(count?.n || 0) + 1).padStart(5, '0')}`;
    const customerId = uid('cus');
    await tx.run(
      `INSERT INTO customers
         (id, shop_id, customer_code, name, phone, normalized_phone, email, address_line1,
          city, state, postal_code, notes, preferred_channel, marketing_consent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      customerId, shop, code, String(fields.name).trim(), fields.phone, norm,
      fields.email || null, fields.address_line1, fields.city, fields.state,
      fields.postal_code, b.notes || lead.notes || `Converted from lead ${lead.lead_code}`,
      b.preferred_channel || 'both', b.marketing_consent ? 1 : 0
    );
    await tx.run(
      `UPDATE crm_leads
       SET customer_id = ?, stage = 'won', updated_at = now()
       WHERE id = ?`,
      customerId, lead.id
    );
    return { customerId, code };
  });

  await audit(req.user.user_id, 'crm.lead.convert', 'crm_lead', lead.id,
    `${lead.lead_code} converted to customer ${result.code}`);
  res.status(201).json({
    data: {
      lead: await get('SELECT * FROM crm_leads WHERE id = ?', lead.id),
      customer: await get('SELECT * FROM customers WHERE id = ?', result.customerId),
    },
  });
});

// --------------------------------------------------------------- activities
router.get('/activities', requirePermission('crm.view'), async (req, res) => {
  const { lead_id, customer_id, kind, due, done, include_inactive, page, limit } = req.query;
  const { page: p, limit: l, offset } = pageArgs(page, limit);
  const conds = ['a.shop_id = ?'];
  const args = [req.user.shop_id];

  if (!(include_inactive === '1' || include_inactive === 'true')) conds.push('a.active = 1');
  if (lead_id) { conds.push('a.lead_id = ?'); args.push(lead_id); }
  if (customer_id) { conds.push('a.customer_id = ?'); args.push(customer_id); }
  if (kind) {
    if (!ACTIVITY_KINDS.includes(kind)) return bad(res, `kind must be one of: ${ACTIVITY_KINDS.join(', ')}`);
    conds.push('a.kind = ?'); args.push(kind);
  }
  if (done === '1' || done === 'true') conds.push('a.done_at IS NOT NULL');
  if (done === '0' || done === 'false') conds.push('a.done_at IS NULL');
  const date = today();
  if (due === 'overdue') { conds.push('a.done_at IS NULL AND a.due_on IS NOT NULL AND a.due_on < ?'); args.push(date); }
  if (due === 'today') { conds.push('a.due_on = ?'); args.push(date); }
  if (due === 'week') { conds.push('a.due_on BETWEEN ? AND ?'); args.push(date, addDays(date, 7)); }

  const where = conds.join(' AND ');
  const rows = await all(
    `SELECT a.*, p.display_name AS created_by_name, l.lead_code, l.name AS lead_name, c.name AS customer_name
     FROM crm_activities a
     LEFT JOIN profiles p ON p.user_id = a.created_by
     LEFT JOIN crm_leads l ON l.id = a.lead_id
     LEFT JOIN customers c ON c.id = a.customer_id
     WHERE ${where}
     ORDER BY a.done_at NULLS FIRST, a.due_on NULLS LAST, a.created_at DESC
     LIMIT ? OFFSET ?`,
    ...args, l, offset
  );
  const total = await get(`SELECT COUNT(*)::int AS n FROM crm_activities a WHERE ${where}`, ...args);
  res.json({ data: rows, total: total?.n || 0, page: p, limit: l });
});

router.post('/activities', requirePermission('crm.manage'), async (req, res) => {
  const b = req.body || {};
  if (!String(b.subject ?? '').trim()) return bad(res, 'subject is required');
  if (!b.lead_id && !b.customer_id) return bad(res, 'lead_id or customer_id is required');
  if (b.kind && !ACTIVITY_KINDS.includes(b.kind)) return bad(res, `kind must be one of: ${ACTIVITY_KINDS.join(', ')}`);
  const due = optionalDate(b.due_on, 'due_on');
  if (due.error) return bad(res, due.error);

  let customerId = b.customer_id || null;
  if (b.lead_id) {
    const lead = await get('SELECT id, customer_id FROM crm_leads WHERE id = ? AND shop_id = ? AND active = 1',
      b.lead_id, req.user.shop_id);
    if (!lead) return bad(res, 'lead not found in this company');
    if (!customerId) customerId = lead.customer_id || null;
  }
  if (customerId) {
    const customer = await get('SELECT id FROM customers WHERE id = ? AND shop_id = ?', customerId, req.user.shop_id);
    if (!customer) return bad(res, 'customer not found in this company');
  }

  const id = uid('act');
  await run(
    `INSERT INTO crm_activities (id, shop_id, lead_id, customer_id, kind, subject, notes, due_on, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, b.lead_id || null, customerId, b.kind || 'note',
    String(b.subject).trim(), b.notes || null, due.value, req.user.user_id
  );
  await audit(req.user.user_id, 'crm.activity.create', 'crm_activity', id, String(b.subject).trim());
  res.status(201).json({ data: await get('SELECT * FROM crm_activities WHERE id = ?', id) });
});

router.patch('/activities/:id', requirePermission('crm.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM crm_activities WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const sets = [];
  const args = [];

  for (const key of ['subject', 'notes', 'outcome']) if (b[key] !== undefined) {
    if (key === 'subject' && !String(b[key] ?? '').trim()) return bad(res, 'subject cannot be empty');
    sets.push(`${key} = ?`); args.push(b[key] || null);
  }
  if (b.kind !== undefined) {
    if (!ACTIVITY_KINDS.includes(b.kind)) return bad(res, `kind must be one of: ${ACTIVITY_KINDS.join(', ')}`);
    sets.push('kind = ?'); args.push(b.kind);
  }
  if (b.due_on !== undefined) {
    const due = optionalDate(b.due_on, 'due_on');
    if (due.error) return bad(res, due.error);
    sets.push('due_on = ?'); args.push(due.value);
  }
  if (b.done !== undefined) {
    sets.push('done_at = ?');
    args.push(b.done ? new Date().toISOString() : null);
  }
  if (!sets.length) return bad(res, 'no editable fields supplied');
  sets.push('updated_at = now()');
  args.push(cur.id);
  await run(`UPDATE crm_activities SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await audit(req.user.user_id, 'crm.activity.update', 'crm_activity', cur.id,
    `${cur.subject}${b.done !== undefined ? (b.done ? ' marked done' : ' reopened') : ' updated'}`);
  res.json({ data: await get('SELECT * FROM crm_activities WHERE id = ?', cur.id) });
});

router.delete('/activities/:id', requirePermission('crm.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM crm_activities WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (cur.active) {
    await run('UPDATE crm_activities SET active = 0, updated_at = now() WHERE id = ?', cur.id);
    await audit(req.user.user_id, 'crm.activity.archive', 'crm_activity', cur.id, cur.subject);
  }
  res.json({ data: { id: cur.id, deactivated: true } });
});

// ------------------------------------------------------------ support cases
router.get('/support-cases', requirePermission('crm.view'), async (req, res) => {
  const { q, status, priority, customer_id, assigned_to, include_inactive, page, limit } = req.query;
  const { page: p, limit: l, offset } = pageArgs(page, limit);
  const conds = ['s.shop_id = ?'];
  const args = [req.user.shop_id];

  if (!(include_inactive === '1' || include_inactive === 'true')) conds.push('s.active = 1');
  if (q) {
    conds.push('(s.subject LIKE ? OR s.description LIKE ? OR s.case_code LIKE ?)');
    const like = `%${q}%`; args.push(like, like, like);
  }
  if (status) {
    if (!CASE_STATUSES.includes(status)) return bad(res, `status must be one of: ${CASE_STATUSES.join(', ')}`);
    conds.push('s.status = ?'); args.push(status);
  }
  if (priority) {
    if (!CASE_PRIORITIES.includes(priority)) return bad(res, `priority must be one of: ${CASE_PRIORITIES.join(', ')}`);
    conds.push('s.priority = ?'); args.push(priority);
  }
  if (customer_id) { conds.push('s.customer_id = ?'); args.push(customer_id); }
  if (assigned_to) { conds.push('s.assigned_to = ?'); args.push(assigned_to); }

  const where = conds.join(' AND ');
  const rows = await all(
    `SELECT s.*, c.name AS customer_name, p.display_name AS assigned_name
     FROM crm_support_cases s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN profiles p ON p.user_id = s.assigned_to
     WHERE ${where}
     ORDER BY s.active DESC,
       CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       s.created_at DESC
     LIMIT ? OFFSET ?`,
    ...args, l, offset
  );
  const total = await get(`SELECT COUNT(*)::int AS n FROM crm_support_cases s WHERE ${where}`, ...args);
  res.json({ data: rows, total: total?.n || 0, page: p, limit: l });
});

router.post('/support-cases', requirePermission('crm.manage'), async (req, res) => {
  const b = req.body || {};
  if (!String(b.subject ?? '').trim()) return bad(res, 'subject is required');
  if (b.status && !CASE_STATUSES.includes(b.status)) return bad(res, `status must be one of: ${CASE_STATUSES.join(', ')}`);
  if (b.priority && !CASE_PRIORITIES.includes(b.priority)) return bad(res, `priority must be one of: ${CASE_PRIORITIES.join(', ')}`);
  if (b.customer_id) {
    const customer = await get('SELECT id FROM customers WHERE id = ? AND shop_id = ?', b.customer_id, req.user.shop_id);
    if (!customer) return bad(res, 'customer not found in this company');
  }
  if (b.assigned_to && !(await activeProfile(req.user.shop_id, b.assigned_to))) {
    return bad(res, 'assignee must be an active user in this company');
  }

  const id = uid('case');
  const code = await nextCode(req.user.shop_id, 'crm_support_cases', 'SC');
  const status = b.status || 'open';
  await run(
    `INSERT INTO crm_support_cases
       (id, shop_id, case_code, customer_id, subject, description, status, priority,
        assigned_to, opened_by, resolved_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, code, b.customer_id || null, String(b.subject).trim(),
    b.description || null, status, b.priority || 'normal', b.assigned_to || null,
    req.user.user_id, ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null
  );
  await audit(req.user.user_id, 'crm.case.create', 'crm_support_case', id, `${code} ${b.subject}`);
  res.status(201).json({ data: await get('SELECT * FROM crm_support_cases WHERE id = ?', id) });
});

router.get('/support-cases/:id', requirePermission('crm.view'), async (req, res) => {
  const row = await get(
    `SELECT s.*, c.name AS customer_name, p.display_name AS assigned_name
     FROM crm_support_cases s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN profiles p ON p.user_id = s.assigned_to
     WHERE s.id = ? AND s.shop_id = ?`,
    req.params.id, req.user.shop_id
  );
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({ data: row });
});

router.patch('/support-cases/:id', requirePermission('crm.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM crm_support_cases WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const sets = [];
  const args = [];

  for (const key of ['subject', 'description']) if (b[key] !== undefined) {
    if (key === 'subject' && !String(b[key] ?? '').trim()) return bad(res, 'subject cannot be empty');
    sets.push(`${key} = ?`); args.push(b[key] || null);
  }
  if (b.status !== undefined) {
    if (!CASE_STATUSES.includes(b.status)) return bad(res, `status must be one of: ${CASE_STATUSES.join(', ')}`);
    sets.push('status = ?'); args.push(b.status);
    if (['resolved', 'closed'].includes(b.status) && !cur.resolved_at) sets.push('resolved_at = now()');
    if (!['resolved', 'closed'].includes(b.status)) sets.push('resolved_at = NULL');
  }
  if (b.priority !== undefined) {
    if (!CASE_PRIORITIES.includes(b.priority)) return bad(res, `priority must be one of: ${CASE_PRIORITIES.join(', ')}`);
    sets.push('priority = ?'); args.push(b.priority);
  }
  if (b.assigned_to !== undefined) {
    if (b.assigned_to && !(await activeProfile(req.user.shop_id, b.assigned_to))) {
      return bad(res, 'assignee must be an active user in this company');
    }
    sets.push('assigned_to = ?'); args.push(b.assigned_to || null);
  }
  if (!sets.length) return bad(res, 'no editable fields supplied');
  sets.push('updated_at = now()');
  args.push(cur.id);
  await run(`UPDATE crm_support_cases SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await audit(req.user.user_id, 'crm.case.update', 'crm_support_case', cur.id,
    `${cur.case_code} updated: ${Object.keys(b).join(', ')}`);
  res.json({ data: await get('SELECT * FROM crm_support_cases WHERE id = ?', cur.id) });
});

router.delete('/support-cases/:id', requirePermission('crm.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM crm_support_cases WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (cur.active) {
    await run('UPDATE crm_support_cases SET active = 0, updated_at = now() WHERE id = ?', cur.id);
    await audit(req.user.user_id, 'crm.case.archive', 'crm_support_case', cur.id, cur.case_code);
  }
  res.json({ data: { id: cur.id, deactivated: true } });
});

module.exports = router;
