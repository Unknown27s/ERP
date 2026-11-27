const express = require('express');
const { all, get, withTransaction, uid } = require('../db');
const { auth, requirePermission } = require('../middleware/auth');
const { hasPermission } = require('../services/rbac');

const router = express.Router();
router.use(auth);
const STATUSES = ['pending', 'in_progress', 'blocked', 'completed'];
const TRANSITIONS = { pending: ['in_progress'], in_progress: ['blocked', 'completed'], blocked: ['in_progress'], completed: [] };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const text = (value, max, label, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, `${label} must be ${required ? '1' : '0'}–${max} characters`);
  return value.trim();
};
const SELECT_TASK = `SELECT t.*, assignee.display_name AS assignee_name, creator.display_name AS assigner_name
  FROM task_assignments t JOIN profiles assignee ON assignee.user_id = t.assigned_to AND assignee.shop_id = t.shop_id
  JOIN profiles creator ON creator.user_id = t.assigned_by AND creator.shop_id = t.shop_id`;
async function auditTask(tx, req, action, taskId, summary) {
  await tx.run(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, summary, shop_id) VALUES (?,?,?,?,?,?,?)`,
    uid('aud'), req.user.user_id, action, 'task_assignment', taskId, summary, req.user.shop_id);
}

router.get('/assignees', requirePermission('hr.manage'), async (req, res) => {
  const rows = await all(`SELECT p.user_id, p.display_name, COALESCE(r.name, CASE WHEN p.role='admin' THEN 'Administrator' ELSE 'Staff' END) AS role_name
    FROM profiles p LEFT JOIN roles r ON r.id=p.role_id AND r.shop_id=p.shop_id
    WHERE p.shop_id=? AND p.active=1 ORDER BY p.display_name, p.user_id`, req.user.shop_id);
  res.json({ data: rows });
});

router.get('/', async (req, res) => {
  const scope = req.query.scope || 'mine';
  if (!['mine', 'team'].includes(scope)) return fail(400, 'Invalid task scope');
  if (scope === 'team' && !hasPermission(req.user.permissions, 'hr.manage')) return fail(403, 'Requires permission: hr.manage');
  const status = req.query.status || 'all';
  if (status !== 'all' && !STATUSES.includes(status)) return fail(400, 'Invalid task status');
  const q = text(req.query.q || '', 200, 'Search');
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return fail(400, 'Invalid page');
  const where = ['t.shop_id=?'];
  const args = [req.user.shop_id];
  if (scope === 'mine') { where.push('t.assigned_to=?'); args.push(req.user.user_id); }
  if (status !== 'all') { where.push('t.status=?'); args.push(status); }
  if (q) { where.push('(t.title ILIKE ? OR t.description ILIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const clause = where.join(' AND ');
  const [rows, count] = await Promise.all([
    all(`${SELECT_TASK} WHERE ${clause} ORDER BY (t.status='completed'), t.due_date ASC NULLS LAST, t.created_at DESC, t.id LIMIT 25 OFFSET ?`, ...args, (page - 1) * 25),
    get(`SELECT COUNT(*) AS total FROM task_assignments t WHERE ${clause}`, ...args),
  ]);
  res.json({ data: rows, total: Number(count.total), page, limit: 25 });
});

router.post('/', requirePermission('hr.manage'), async (req, res) => {
  const b = req.body || {};
  if (Object.keys(b).some((key) => !['title', 'description', 'assigned_to', 'due_date'].includes(key))) return fail(400, 'Unsupported task field');
  const title = text(b.title, 200, 'Title', true);
  const description = text(b.description ?? '', 5000, 'Description');
  if (typeof b.assigned_to !== 'string' || !b.assigned_to || b.assigned_to.length > 200) return fail(400, 'Assignee is required');
  const due = b.due_date === undefined || b.due_date === '' || b.due_date === null ? null : b.due_date;
  if (due !== null && !validDate(due)) return fail(400, 'Due date must be a real YYYY-MM-DD date');
  const task = await withTransaction(async (tx) => {
    const assignee = await tx.get('SELECT user_id FROM profiles WHERE user_id=? AND shop_id=? AND active=1 FOR SHARE', b.assigned_to, req.user.shop_id);
    if (!assignee) return fail(400, 'Assignee must be an active person in your company');
    const id = uid('task');
    await tx.run(`INSERT INTO task_assignments (id, shop_id, title, description, assigned_to, assigned_by, due_date) VALUES (?,?,?,?,?,?,?)`, id, req.user.shop_id, title, description, b.assigned_to, req.user.user_id, due);
    await auditTask(tx, req, 'task.assign', id, `Assigned task: ${title}`);
    return tx.get(`${SELECT_TASK} WHERE t.id=? AND t.shop_id=?`, id, req.user.shop_id);
  });
  res.status(201).json({ data: task });
});

router.patch('/:id/status', async (req, res) => {
  const b = req.body || {};
  if (Object.keys(b).some((key) => !['status', 'version', 'note'].includes(key))) return fail(400, 'Only status, version and note may be changed');
  if (!STATUSES.includes(b.status)) return fail(400, 'Invalid task status');
  if (!Number.isInteger(b.version) || b.version < 1) return fail(400, 'Current task version is required');
  const note = b.note === undefined ? undefined : text(b.note, 2000, 'Progress note');
  if (b.status === 'blocked' && !note) return fail(400, 'Explain what is blocking this task');
  const task = await withTransaction(async (tx) => {
    const row = await tx.get('SELECT * FROM task_assignments WHERE id=? AND shop_id=? AND assigned_to=? FOR UPDATE', req.params.id, req.user.shop_id, req.user.user_id);
    if (!row) return fail(404, 'Task not found');
    if (row.version !== b.version) return fail(409, 'This task changed. Refresh and try again.');
    if (!TRANSITIONS[row.status].includes(b.status)) return fail(409, `Cannot change ${row.status} to ${b.status}`);
    await tx.run(`UPDATE task_assignments SET status=?, progress_note=?, version=version+1, updated_at=now(), completed_at=CASE WHEN ?='completed' THEN now() ELSE NULL END WHERE id=? AND shop_id=?`, b.status, note ?? row.progress_note, b.status, row.id, req.user.shop_id);
    await auditTask(tx, req, 'task.status', row.id, `${row.status} -> ${b.status}: ${row.title}`);
    return tx.get(`${SELECT_TASK} WHERE t.id=? AND t.shop_id=?`, row.id, req.user.shop_id);
  });
  res.json({ data: task });
});

module.exports = router;
