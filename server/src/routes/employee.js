/**
 * Employee Self-Service (ESS) Portal API.
 *
 * Dedicated namespace (/api/employee/*) strictly scoped to the authenticated
 * user's linked employee profile. Enables:
 * - Profile viewing & picture upload (avatar_url / photo_url)
 * - Daily clock in / clock out & hourly work session tracking
 * - Completed tasks tracking with tags and hours spent
 * - Leave balance checking, leave applications, and status tracking
 * - Payslips and compensation history
 * - Work logs & task completion visual reporting summary
 *
 * All operations are scoped by `shop_id` and the user's `employee_id`.
 */

const express = require('express');
const { get, all, run, withTransaction, uid } = require('../db');
const { auth, audit } = require('../middleware/auth');
const { today, currentMonth, dateInTz } = require('../services/date');

const router = express.Router();
router.use(auth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function taskTiming(startedAt, endedAt, workDate) {
  if (!startedAt || !endedAt) return null; // legacy hours-only entries
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const hours = (end.getTime() - start.getTime()) / 3600000;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 ||
      dateInTz(start) !== workDate || dateInTz(end) !== workDate) return null;
  return { start: start.toISOString(), end: end.toISOString(), hours: round2(hours) };
}

function bad(res, message) {
  return res.status(400).json({ error: 'bad_request', message });
}

/**
 * Resolve the current user's employee record.
 * Must be explicitly linked by HR or Administrator via employees.user_id.
 */
async function resolveEmployee(req) {
  const shopId = req.user.shop_id;
  const userId = req.user.user_id;

  return get(
    `SELECT e.*, d.name AS department_name, g.name AS designation_name,
            b.name AS branch_name, m.full_name AS manager_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN designations g ON g.id = e.designation_id
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN employees m ON m.id = e.manager_id
     WHERE e.user_id = ? AND e.shop_id = ?`,
    userId, shopId
  );
}

// ---------------------------------------------------------------- me (profile)
router.get('/me', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) {
    return res.status(404).json({
      error: 'employee_not_linked',
      message: 'No employee record linked to this login account. Contact HR to link your employee profile.',
      user: {
        user_id: req.user.user_id,
        email: req.user.email,
        display_name: req.user.display_name,
        role_name: req.user.role_name,
      },
    });
  }

  // Fetch today's clock status
  const todayDate = today();
  const session = await get(
    `SELECT * FROM employee_work_sessions
     WHERE employee_id = ? AND work_date = ? AND clock_out IS NULL
     ORDER BY clock_in DESC LIMIT 1`,
    emp.id, todayDate
  );

  const att = await get(
    `SELECT * FROM attendance WHERE employee_id = ? AND work_date = ?`,
    emp.id, todayDate
  );

  res.json({
    data: {
      ...emp,
      today_status: {
        is_clocked_in: !!session,
        active_session: session || null,
        attendance_status: att ? att.status : 'not_marked',
        worked_minutes: att ? att.worked_minutes : (session ? Math.round((Date.now() - new Date(session.clock_in).getTime()) / 60000) : 0),
      },
    },
  });
});

router.patch('/me', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const b = req.body || {};
  const updates = [];
  const args = [];

  if (b.photo_url !== undefined) {
    updates.push('photo_url = ?');
    args.push(b.photo_url || null);
    // Also keep profiles.avatar_url in sync
    await run('UPDATE profiles SET avatar_url = ? WHERE user_id = ?', b.photo_url || null, req.user.user_id);
  }
  if (b.phone !== undefined) {
    updates.push('phone = ?');
    args.push(b.phone ? String(b.phone).trim() : null);
  }
  if (b.address !== undefined) {
    updates.push('address = ?');
    args.push(b.address ? String(b.address).trim() : null);
  }
  if (b.dob && isDate(b.dob)) {
    updates.push('dob = ?');
    args.push(b.dob);
  }
  if (b.gender !== undefined) {
    updates.push('gender = ?');
    args.push(b.gender ? String(b.gender).trim() : null);
  }

  if (updates.length > 0) {
    args.push(emp.id, req.user.shop_id);
    await run(`UPDATE employees SET ${updates.join(', ')}, updated_at = now() WHERE id = ? AND shop_id = ?`, ...args);
    await audit(req.user.user_id, 'employee.profile.update', 'employee', emp.id, 'Self-service profile update');
  }

  const updated = await resolveEmployee(req);
  res.json({ data: updated });
});

// ------------------------------------------------------------- clock in / out
router.get('/clock', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const todayDate = today();
  const activeSession = await get(
    `SELECT * FROM employee_work_sessions
     WHERE employee_id = ? AND work_date = ? AND clock_out IS NULL
     ORDER BY clock_in DESC LIMIT 1`,
    emp.id, todayDate
  );

  const todaySessions = await all(
    `SELECT * FROM employee_work_sessions
     WHERE employee_id = ? AND work_date = ?
     ORDER BY clock_in DESC`,
    emp.id, todayDate
  );

  let totalMins = 0;
  for (const s of todaySessions) {
    if (s.clock_out) {
      totalMins += s.total_minutes || 0;
    } else {
      totalMins += Math.max(0, Math.round((Date.now() - new Date(s.clock_in).getTime()) / 60000));
    }
  }

  res.json({
    data: {
      is_clocked_in: !!activeSession,
      active_session: activeSession || null,
      today_sessions: todaySessions,
      total_minutes_today: totalMins,
      total_hours_today: round2(totalMins / 60),
    },
  });
});

router.post('/clock', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const { action, notes } = req.body || {};
  if (!['in', 'out'].includes(action)) return bad(res, 'action must be "in" or "out"');

  const todayDate = today();

  if (action === 'in') {
    // Check if already clocked in
    const active = await get(
      `SELECT * FROM employee_work_sessions
       WHERE employee_id = ? AND work_date = ? AND clock_out IS NULL`,
      emp.id, todayDate
    );
    if (active) return res.status(409).json({ error: 'conflict', message: 'Already clocked in' });

    const sessionId = uid('ws');
    await run(
      `INSERT INTO employee_work_sessions (id, shop_id, employee_id, work_date, clock_in, notes)
       VALUES (?,?,?,?,now(),?)`,
      sessionId, req.user.shop_id, emp.id, todayDate, notes || null
    );

    // Ensure attendance row is marked present without overwriting HR's authoritative records (DO NOTHING on conflict)
    await run(
      `INSERT INTO attendance (id, shop_id, employee_id, work_date, status, source, created_by)
       VALUES (?,?,?,?,'present','portal',?)
       ON CONFLICT (employee_id, work_date) DO NOTHING`,
      uid('att'), req.user.shop_id, emp.id, todayDate, req.user.user_id
    );

    await audit(req.user.user_id, 'employee.clock.in', 'work_session', sessionId, `${todayDate} Clock In`);
    const session = await get('SELECT * FROM employee_work_sessions WHERE id = ?', sessionId);
    return res.status(201).json({ data: { session, is_clocked_in: true } });
  }

  // action === 'out'
  const active = await get(
    `SELECT * FROM employee_work_sessions
     WHERE employee_id = ? AND work_date = ? AND clock_out IS NULL
     ORDER BY clock_in DESC LIMIT 1`,
    emp.id, todayDate
  );
  if (!active) return res.status(400).json({ error: 'bad_request', message: 'No active clock-in session found' });

  const diffMins = Math.max(1, Math.round((Date.now() - new Date(active.clock_in).getTime()) / 60000));
  await run(
    `UPDATE employee_work_sessions
     SET clock_out = now(), total_minutes = ?, notes = COALESCE(?, notes)
     WHERE id = ?`,
    diffMins, notes || null, active.id
  );

  // Update total worked minutes in attendance
  const [sum] = await all(
    `SELECT COALESCE(SUM(total_minutes), 0) AS mins
     FROM employee_work_sessions WHERE employee_id = ? AND work_date = ?`,
    emp.id, todayDate
  );
  await run(
    `UPDATE attendance SET worked_minutes = ?, updated_at = now()
     WHERE employee_id = ? AND work_date = ?`,
    sum?.mins || diffMins, emp.id, todayDate
  );

  await audit(req.user.user_id, 'employee.clock.out', 'work_session', active.id, `${todayDate} Clock Out (${diffMins}m)`);
  const session = await get('SELECT * FROM employee_work_sessions WHERE id = ?', active.id);
  res.json({ data: { session, is_clocked_in: false, total_minutes_today: sum?.mins || diffMins } });
});

// ------------------------------------------------------------- tasks completed
router.get('/tasks', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const { from_date, to_date, date, tag, status, q, limit } = req.query;
  const conds = ['employee_id = ?', 'shop_id = ?', 'active = 1'];
  const args = [emp.id, req.user.shop_id];

  if (date) {
    if (!isDate(date)) return bad(res, 'date must be YYYY-MM-DD');
    conds.push('work_date = ?');
    args.push(date);
  }
  if (from_date && to_date) {
    if (!isDate(from_date) || !isDate(to_date)) return bad(res, 'from_date and to_date must be YYYY-MM-DD');
    conds.push('work_date BETWEEN ? AND ?');
    args.push(from_date, to_date);
  }
  if (tag && tag !== 'all') {
    conds.push('LOWER(tag) = LOWER(?)');
    args.push(tag);
  }
  if (status && status !== 'all') {
    conds.push('status = ?');
    args.push(status);
  }
  if (q) {
    conds.push('(task_title ILIKE ? OR description ILIKE ?)');
    const like = `%${q}%`;
    args.push(like, like);
  }

  const lim = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  const rows = await all(
    `SELECT * FROM employee_tasks
     WHERE ${conds.join(' AND ')}
     ORDER BY work_date DESC, created_at DESC
     LIMIT ${lim}`,
    ...args
  );

  res.json({ data: rows });
});

router.post('/tasks', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const { task_title, description, tag, hours_spent, work_date, status, project_or_lead_ref, started_at, ended_at } = req.body || {};
  const cleanTitle = String(task_title || '').trim();
  if (!cleanTitle) return bad(res, 'task_title required');

  const date = work_date && isDate(work_date) ? work_date : today();
  const cleanTag = String(tag || 'general').trim().toLowerCase().replace(/^#/, '');
  const cleanStatus = ['completed', 'in_progress', 'blocked'].includes(status) ? status : 'completed';
  if (!started_at || !ended_at) return bad(res, 'Start and end times are required for new tasks');
  const timing = taskTiming(started_at, ended_at, date);
  if (!timing) return bad(res, 'Start and end must be on the work date, in order, and within 24 hours');

  const id = uid('tsk');
  await run(
    `INSERT INTO employee_tasks (id, shop_id, employee_id, work_date, task_title, description, tag, hours_spent, status, project_or_lead_ref, started_at, ended_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, emp.id, date, cleanTitle, description ? String(description).trim() : null,
    cleanTag, timing.hours, cleanStatus, project_or_lead_ref ? String(project_or_lead_ref).trim() : null,
    timing.start, timing.end
  );

  await audit(req.user.user_id, 'employee.task.create', 'task', id, `${date} ${cleanTag}: ${cleanTitle} (${timing.hours}h)`);
  res.status(201).json({ data: await get('SELECT * FROM employee_tasks WHERE id = ?', id) });
});

router.patch('/tasks/:id', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const task = await get(
    'SELECT * FROM employee_tasks WHERE id = ? AND employee_id = ? AND shop_id = ?',
    req.params.id, emp.id, req.user.shop_id
  );
  if (!task) return res.status(404).json({ error: 'not_found', message: 'Task not found' });

  const b = req.body || {};
  const updates = [];
  const args = [];

  if (b.task_title !== undefined) {
    const t = String(b.task_title).trim();
    if (!t) return bad(res, 'task_title cannot be empty');
    updates.push('task_title = ?');
    args.push(t);
  }
  if (b.description !== undefined) {
    updates.push('description = ?');
    args.push(b.description ? String(b.description).trim() : null);
  }
  if (b.tag !== undefined) {
    updates.push('tag = ?');
    args.push(String(b.tag).trim().toLowerCase().replace(/^#/, ''));
  }
  if (b.hours_spent !== undefined) {
    const h = num(b.hours_spent);
    if (h <= 0) return bad(res, 'hours_spent must be > 0');
    if (!task.started_at && !task.ended_at && b.started_at === undefined && b.ended_at === undefined) {
      updates.push('hours_spent = ?');
      args.push(round2(h)); // legacy hours-only logs
    }
  }
  if (b.work_date !== undefined && isDate(b.work_date)) {
    updates.push('work_date = ?');
    args.push(b.work_date);
  }
  if (b.started_at !== undefined || b.ended_at !== undefined || task.started_at || task.ended_at) {
    const date = b.work_date || task.work_date;
    const timing = taskTiming(b.started_at ?? task.started_at, b.ended_at ?? task.ended_at, date);
    if (!timing) return bad(res, 'Start and end must be on the work date, in order, and within 24 hours');
    updates.push('started_at = ?', 'ended_at = ?', 'hours_spent = ?');
    args.push(timing.start, timing.end, timing.hours);
  }
  if (b.status !== undefined && ['completed', 'in_progress', 'blocked'].includes(b.status)) {
    updates.push('status = ?');
    args.push(b.status);
  }

  if (updates.length > 0) {
    args.push(task.id);
    await run(`UPDATE employee_tasks SET ${updates.join(', ')}, updated_at = now() WHERE id = ?`, ...args);
    await audit(req.user.user_id, 'employee.task.update', 'task', task.id, `Task edited: ${task.task_title}`);
  }

  res.json({ data: await get('SELECT * FROM employee_tasks WHERE id = ?', task.id) });
});

router.delete('/tasks/:id', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const task = await get(
    'SELECT * FROM employee_tasks WHERE id = ? AND employee_id = ? AND shop_id = ?',
    req.params.id, emp.id, req.user.shop_id
  );
  if (!task) return res.status(404).json({ error: 'not_found' });

  await run('UPDATE employee_tasks SET active = 0, updated_at = now() WHERE id = ?', task.id);
  await audit(req.user.user_id, 'employee.task.delete', 'task', task.id, `Task removed: ${task.task_title}`);
  res.json({ data: { success: true } });
});

// ------------------------------------------------------------- leaves (ESS)
router.get('/leaves', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const year = Number(today().slice(0, 4));

  // Ensure balance rows exist for all active leave types
  const types = await all('SELECT * FROM leave_types WHERE shop_id = ? AND active = 1 ORDER BY name', req.user.shop_id);
  for (const t of types) {
    await run(
      `INSERT INTO leave_balances (id, shop_id, employee_id, leave_type_id, year, entitled, used)
       VALUES (?,?,?,?,?,?,0)
       ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING`,
      uid('lvb'), req.user.shop_id, emp.id, t.id, year, num(t.annual_quota)
    );
  }

  const balances = await all(
    `SELECT b.*, t.name AS leave_type_name, t.paid, (b.entitled - b.used) AS balance
     FROM leave_balances b
     JOIN leave_types t ON t.id = b.leave_type_id
     WHERE b.employee_id = ? AND b.year = ? AND b.shop_id = ?
     ORDER BY t.name`,
    emp.id, year, req.user.shop_id
  );

  const requests = await all(
    `SELECT l.*, t.name AS leave_type_name, t.paid
     FROM leave_requests l
     JOIN leave_types t ON t.id = l.leave_type_id
     WHERE l.employee_id = ? AND l.shop_id = ?
     ORDER BY l.created_at DESC`,
    emp.id, req.user.shop_id
  );

  res.json({
    data: {
      balances: balances.map((b) => ({ ...b, balance: round2(b.balance) })),
      requests,
      types,
      year,
    },
  });
});

router.post('/leaves', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const { leave_type_id, from_date, to_date, reason } = req.body || {};
  if (!leave_type_id) return bad(res, 'leave_type_id required');
  if (!isDate(from_date) || !isDate(to_date)) return bad(res, 'from_date and to_date must be YYYY-MM-DD');
  if (to_date < from_date) return bad(res, 'to_date cannot be before from_date');

  const type = await get('SELECT * FROM leave_types WHERE id = ? AND shop_id = ?', leave_type_id, req.user.shop_id);
  if (!type) return res.status(404).json({ error: 'not_found', message: 'Leave type not found' });

  const span = Math.round((Date.parse(`${to_date}T00:00:00Z`) - Date.parse(`${from_date}T00:00:00Z`)) / 86400000) + 1;
  const requested = (req.body || {}).days !== undefined ? num(req.body.days) : span;
  if (!(requested > 0) || requested > span) return bad(res, 'days must be between 0 and the date range');

  // Prevent overlapping requests
  const overlap = await get(
    `SELECT id FROM leave_requests
     WHERE employee_id = ? AND status IN ('pending','approved')
       AND NOT (to_date < ? OR from_date > ?)`,
    emp.id, from_date, to_date
  );
  if (overlap) return res.status(409).json({ error: 'conflict', message: 'Overlaps an existing pending or approved leave' });

  const year = Number(from_date.slice(0, 4));
  const balance = await get(
    'SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?',
    emp.id, leave_type_id, year
  );
  if (type.paid && balance && num(balance.entitled) > 0 && num(balance.entitled) - num(balance.used) < requested) {
    return res.status(409).json({
      error: 'conflict',
      message: `Insufficient balance for ${type.name} (${round2(num(balance.entitled) - num(balance.used))} remaining)`,
    });
  }

  const id = uid('lvr');
  await run(
    `INSERT INTO leave_requests (id, shop_id, employee_id, leave_type_id, from_date, to_date, days, reason, status)
     VALUES (?,?,?,?,?,?,?,?,'pending')`,
    id, req.user.shop_id, emp.id, leave_type_id, from_date, to_date, requested, reason ? String(reason).trim() : null
  );

  await audit(req.user.user_id, 'employee.leave.apply', 'leave_request', id, `${type.name}: ${from_date}→${to_date} (${requested}d)`);
  res.status(201).json({ data: await get('SELECT * FROM leave_requests WHERE id = ?', id) });
});

router.delete('/leaves/:id', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const request = await get(
    'SELECT * FROM leave_requests WHERE id = ? AND employee_id = ? AND shop_id = ?',
    req.params.id, emp.id, req.user.shop_id
  );
  if (!request) return res.status(404).json({ error: 'not_found' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'conflict', message: `Cannot cancel an already ${request.status} request` });

  await run(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`, request.id);
  await audit(req.user.user_id, 'employee.leave.cancel', 'leave_request', request.id, 'Self-cancelled leave request');
  res.json({ data: { cancelled: true } });
});

// ----------------------------------------------------------- payslips / pay
router.get('/payslips', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const rows = await all(
    `SELECT ps.*, pr.period, pr.status AS run_status, pr.paid_at
     FROM payslips ps
     JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
     WHERE ps.employee_id = ? AND ps.shop_id = ?
     ORDER BY pr.period DESC`,
    emp.id, req.user.shop_id
  );

  res.json({ data: rows });
});

router.get('/payslips/:id', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const row = await get(
    `SELECT ps.*, pr.period, pr.status AS run_status, pr.working_days, pr.paid_at
     FROM payslips ps
     JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
     WHERE ps.id = ? AND ps.employee_id = ? AND ps.shop_id = ?`,
    req.params.id, emp.id, req.user.shop_id
  );
  if (!row) return res.status(404).json({ error: 'not_found' });

  res.json({
    data: {
      ...row,
      employee: {
        emp_code: emp.emp_code,
        full_name: emp.full_name,
        department_name: emp.department_name,
        designation_name: emp.designation_name,
        joining_date: emp.joining_date,
        bank_account: emp.bank_account,
        bank_ifsc: emp.bank_ifsc,
        pan: emp.pan,
      },
    },
  });
});

// ------------------------------------------------- reports & analytics summary
router.get('/reports/summary', async (req, res) => {
  const emp = await resolveEmployee(req);
  if (!emp) return res.status(404).json({ error: 'employee_not_linked' });

  const { from_date, to_date, period } = req.query;
  let from, to;

  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    from = `${period}-01`;
    to = `${period}-${String(lastDay).padStart(2, '0')}`;
  } else if (from_date && to_date && isDate(from_date) && isDate(to_date)) {
    from = from_date;
    to = to_date;
  } else {
    // Default to current month
    const curPeriod = currentMonth();
    const [y, m] = curPeriod.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    from = `${curPeriod}-01`;
    to = `${curPeriod}-${String(lastDay).padStart(2, '0')}`;
  }

  // 1. Total tasks & hours from employee_tasks
  const tasks = await all(
    `SELECT * FROM employee_tasks
     WHERE employee_id = ? AND shop_id = ? AND work_date BETWEEN ? AND ? AND active = 1
     ORDER BY work_date DESC, created_at DESC`,
    emp.id, req.user.shop_id, from, to
  );

  let totalTaskHours = 0;
  const tagHoursMap = {};
  for (const t of tasks) {
    const h = num(t.hours_spent);
    totalTaskHours += h;
    const tag = t.tag || 'general';
    tagHoursMap[tag] = (tagHoursMap[tag] || 0) + h;
  }

  const tasksByTag = Object.entries(tagHoursMap).map(([tag, hours]) => ({
    tag,
    hours: round2(hours),
    percentage: totalTaskHours > 0 ? round2((hours / totalTaskHours) * 100) : 0,
  })).sort((a, b) => b.hours - a.hours);

  // 2. Daily trend (aggregated by work_date)
  const dailyMap = {};
  for (const t of tasks) {
    if (!dailyMap[t.work_date]) {
      dailyMap[t.work_date] = { date: t.work_date, hours: 0, tasks_count: 0 };
    }
    dailyMap[t.work_date].hours += num(t.hours_spent);
    dailyMap[t.work_date].tasks_count += 1;
  }

  const dailyTrend = Object.values(dailyMap)
    .map((d) => ({ ...d, hours: round2(d.hours) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 3. Attendance & Leave stats
  const [attStats] = await all(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'present')::int AS present_days,
       COUNT(*) FILTER (WHERE status = 'half_day')::int AS half_days,
       COUNT(*) FILTER (WHERE status = 'leave')::int AS leave_days,
       COALESCE(SUM(worked_minutes), 0)::int AS total_worked_minutes
     FROM attendance
     WHERE employee_id = ? AND shop_id = ? AND work_date BETWEEN ? AND ?`,
    emp.id, req.user.shop_id, from, to
  );

  res.json({
    data: {
      period: { from, to },
      employee: {
        id: emp.id,
        emp_code: emp.emp_code,
        full_name: emp.full_name,
        department_name: emp.department_name,
        designation_name: emp.designation_name,
      },
      summary: {
        total_task_hours: round2(totalTaskHours),
        total_tasks: tasks.length,
        clocked_hours: round2((attStats?.total_worked_minutes || 0) / 60),
        present_days: attStats?.present_days || 0,
        half_days: attStats?.half_days || 0,
        leave_days: attStats?.leave_days || 0,
      },
      tasks_by_tag: tasksByTag,
      daily_trend: dailyTrend,
      tasks,
    },
  });
});

module.exports = router;
