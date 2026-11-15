/**
 * Staff Management (Phase 1): users, roles, permissions, departments and
 * designations. Every route is guarded by a server-side permission check.
 *
 * Users are never hard-deleted: deactivation (`active = 0`) keeps the audit
 * trail and every historical link intact.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { get, all, run, uid } = require('../db');
const { auth, requirePermission, audit } = require('../middleware/auth');
const { PERMISSIONS, ensureRbac } = require('../services/rbac');

const router = express.Router();
router.use(auth);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SAFE_PROFILE_COLS = 'p.user_id, p.shop_id, p.role, p.role_id, p.display_name, p.email, p.phone, p.active, p.is_primary, p.last_login_at';
const ALLOWED_PERMISSIONS = new Set(PERMISSIONS.map((p) => p.key));

const bad = (res, message) => res.status(400).json({ error: 'bad_request', message });

async function roleRow(shopId, roleId) {
  return get('SELECT * FROM roles WHERE id = ? AND shop_id = ? AND active = 1', roleId, shopId);
}

async function rolePermissions(roleId) {
  const rows = await all('SELECT permission_key FROM role_permissions WHERE role_id = ?', roleId);
  return rows.map((r) => r.permission_key);
}

// ------------------------------------------------------------------- users
router.get('/users', requirePermission('staff.view'), async (req, res) => {
  const rows = await all(
    `SELECT ${SAFE_PROFILE_COLS}, r.name AS role_name
     FROM profiles p LEFT JOIN roles r ON r.id = p.role_id
     WHERE p.shop_id = ? ORDER BY p.active DESC, r.name, p.display_name`,
    req.user.shop_id
  );
  res.json({ data: rows });
});

router.post('/users', requirePermission('staff.manage'), async (req, res) => {
  const { name, email, phone, password, role_id } = req.body || {};
  if (!name || !email || !password) return bad(res, 'name, email and password are required');
  if (String(password).length < 8) return bad(res, 'password must be at least 8 characters');
  const em = String(email).toLowerCase().trim();
  if (!EMAIL_RE.test(em)) return bad(res, 'a valid email address is required');
  if (await get('SELECT user_id FROM profiles WHERE email = ?', em)) {
    return res.status(409).json({ error: 'conflict', message: 'Login email already in use' });
  }
  const role = role_id ? await roleRow(req.user.shop_id, role_id) : null;
  if (!role) return bad(res, 'choose a valid role');

  const id = uid('usr');
  // `profiles.role` is the legacy flag still read by older code paths;
  // new accounts are never the shop's primary administrator.
  const legacyRole = role.name === 'Administrator' ? 'admin' : 'staff';
  await run(
    `INSERT INTO profiles (user_id, shop_id, role, role_id, display_name, email, phone, password_hash, active, is_primary)
     VALUES (?,?,?,?,?,?,?,?,1,0)`,
    id, req.user.shop_id, legacyRole, role.id, String(name).trim(), em,
    phone ? String(phone).trim() : null, bcrypt.hashSync(String(password), 10)
  );
  await audit(req.user.user_id, 'staff.create', 'profile', id, `${role.name} account ${em} (${name})`);
  res.status(201).json({
    data: await get(
      `SELECT ${SAFE_PROFILE_COLS}, r.name AS role_name FROM profiles p
       LEFT JOIN roles r ON r.id = p.role_id WHERE p.user_id = ?`, id
    ),
  });
});

router.patch('/users/:id', requirePermission('staff.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM profiles WHERE user_id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const { name, phone, active, role_id } = req.body || {};

  if (cur.user_id === req.user.user_id && (active === false || active === 0)) {
    return res.status(409).json({ error: 'conflict', message: 'You cannot deactivate your own account' });
  }
  if (cur.is_primary && (active === false || active === 0)) {
    return res.status(409).json({ error: 'conflict', message: 'The primary administrator cannot be deactivated' });
  }
  if (cur.is_primary && role_id && role_id !== cur.role_id) {
    return res.status(409).json({ error: 'conflict', message: 'The primary administrator must keep the Administrator role' });
  }

  let nextRole = null;
  if (role_id && role_id !== cur.role_id) {
    nextRole = await roleRow(req.user.shop_id, role_id);
    if (!nextRole) return bad(res, 'choose a valid role');
  }

  const sets = []; const args = [];
  if (name !== undefined) { sets.push('display_name = ?'); args.push(String(name).trim()); }
  if (phone !== undefined) { sets.push('phone = ?'); args.push(phone ? String(phone).trim() : null); }
  if (active !== undefined) { sets.push('active = ?'); args.push(active ? 1 : 0); }
  if (nextRole) {
    sets.push('role_id = ?'); args.push(nextRole.id);
    sets.push('role = ?'); args.push(nextRole.name === 'Administrator' ? 'admin' : 'staff');
  }
  if (!sets.length) return bad(res, 'nothing to update');
  args.push(cur.user_id);
  await run(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = ?`, ...args);

  const bits = [];
  if (active !== undefined) bits.push(active ? 'activated' : 'deactivated');
  if (nextRole) bits.push(`role → ${nextRole.name}`);
  if (name !== undefined) bits.push('name changed');
  if (phone !== undefined) bits.push('phone changed');
  await audit(req.user.user_id, 'staff.update', 'profile', cur.user_id, `${cur.email}: ${bits.join(', ')}`);
  res.json({
    data: await get(
      `SELECT ${SAFE_PROFILE_COLS}, r.name AS role_name FROM profiles p
       LEFT JOIN roles r ON r.id = p.role_id WHERE p.user_id = ?`, cur.user_id
    ),
  });
});

router.post('/users/:id/reset-password', requirePermission('staff.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM profiles WHERE user_id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const next = req.body && req.body.newPassword
    ? String(req.body.newPassword)
    : crypto.randomBytes(9).toString('base64url');
  if (next.length < 8) return bad(res, 'password must be at least 8 characters');
  await run('UPDATE profiles SET password_hash = ? WHERE user_id = ?', bcrypt.hashSync(next, 10), cur.user_id);
  await audit(req.user.user_id, 'staff.reset_password', 'profile', cur.user_id, `password reset for ${cur.email}`);
  res.json({
    data: {
      user_id: cur.user_id,
      email: cur.email,
      temporaryPassword: next,
      note: 'Share once over a trusted channel; it cannot be retrieved again.',
    },
  });
});

router.get('/users/:id/activity', requirePermission('staff.view'), async (req, res) => {
  const cur = await get('SELECT user_id FROM profiles WHERE user_id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const rows = await all(
    `SELECT id, action, entity_type, entity_id, summary, created_at
     FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT 100`,
    cur.user_id
  );
  res.json({ data: rows });
});

// ------------------------------------------------------------------- roles
router.get('/roles', requirePermission('staff.view'), async (req, res) => {
  const roles = await all(
    `SELECT r.*, COUNT(DISTINCT p.user_id)::int AS user_count,
            COUNT(DISTINCT rp.permission_key)::int AS permission_count
     FROM roles r
     LEFT JOIN profiles p ON p.role_id = r.id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.shop_id = ?
     GROUP BY r.id ORDER BY r.is_system DESC, r.name`,
    req.user.shop_id
  );
  for (const r of roles) r.permissions = await rolePermissions(r.id);
  res.json({ data: roles });
});

router.post('/roles', requirePermission('roles.manage'), async (req, res) => {
  const { name, description } = req.body || {};
  const clean = String(name || '').trim();
  if (!clean) return bad(res, 'role name is required');
  if (clean.length > 60) return bad(res, 'role name is too long');
  const exists = await get('SELECT id FROM roles WHERE shop_id = ? AND LOWER(name) = LOWER(?)', req.user.shop_id, clean);
  if (exists) return res.status(409).json({ error: 'conflict', message: 'A role with that name already exists' });
  const id = uid('role');
  await run(
    'INSERT INTO roles (id, shop_id, name, description, is_system) VALUES (?,?,?,?,0)',
    id, req.user.shop_id, clean, description ? String(description).trim() : null
  );
  await audit(req.user.user_id, 'role.create', 'role', id, clean);
  res.status(201).json({ data: await get('SELECT * FROM roles WHERE id = ?', id) });
});

router.patch('/roles/:id', requirePermission('roles.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM roles WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const { name, description, active } = req.body || {};
  if (cur.is_system && name !== undefined && String(name).trim() !== cur.name) {
    return res.status(409).json({ error: 'conflict', message: 'Built-in roles cannot be renamed' });
  }
  if (cur.is_system && cur.name === 'Administrator' && active === 0) {
    return res.status(409).json({ error: 'conflict', message: 'The Administrator role cannot be deactivated' });
  }
  const sets = []; const args = [];
  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return bad(res, 'role name is required');
    const dup = await get('SELECT id FROM roles WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND id <> ?', req.user.shop_id, clean, cur.id);
    if (dup) return res.status(409).json({ error: 'conflict', message: 'A role with that name already exists' });
    sets.push('name = ?'); args.push(clean);
  }
  if (description !== undefined) { sets.push('description = ?'); args.push(String(description).trim() || null); }
  if (active !== undefined) { sets.push('active = ?'); args.push(active ? 1 : 0); }
  if (!sets.length) return bad(res, 'nothing to update');
  args.push(cur.id);
  await run(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await audit(req.user.user_id, 'role.update', 'role', cur.id, `${cur.name}: ${Object.keys(req.body || {}).join(', ')}`);
  res.json({ data: await get('SELECT * FROM roles WHERE id = ?', cur.id) });
});

router.put('/roles/:id/permissions', requirePermission('roles.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM roles WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (cur.name === 'Administrator') {
    return res.status(409).json({ error: 'conflict', message: 'Administrator always has every permission' });
  }
  const keys = Array.isArray(req.body?.permissions) ? req.body.permissions : null;
  if (!keys) return bad(res, 'permissions must be an array');
  const unknown = keys.filter((k) => !ALLOWED_PERMISSIONS.has(k));
  if (unknown.length) return bad(res, `unknown permission(s): ${unknown.join(', ')}`);

  await run('DELETE FROM role_permissions WHERE role_id = ?', cur.id);
  for (const key of [...new Set(keys)]) {
    await run('INSERT INTO role_permissions (role_id, permission_key) VALUES (?,?) ON CONFLICT DO NOTHING', cur.id, key);
  }
  await audit(
    req.user.user_id, 'role.permissions', 'role', cur.id,
    `${cur.name}: ${keys.length} permission(s) — ${keys.join(', ') || 'none'}`
  );
  res.json({ data: { role_id: cur.id, permissions: await rolePermissions(cur.id) } });
});

router.get('/permissions', requirePermission('staff.view'), (req, res) => {
  res.json({ data: PERMISSIONS });
});

// -------------------------------------------------- departments/designations
router.get('/departments', requirePermission('staff.view'), async (req, res) => {
  const rows = await all(
    `SELECT d.*, (
       SELECT COUNT(*)::int FROM employees e WHERE e.department_id = d.id AND e.status <> 'exited'
     ) AS employee_count
     FROM departments d WHERE d.shop_id = ? ORDER BY d.active DESC, d.name`,
    req.user.shop_id
  );
  res.json({ data: rows });
});

router.post('/departments', requirePermission('staff.manage'), async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return bad(res, 'department name is required');
  const existing = await get('SELECT * FROM departments WHERE shop_id = ? AND LOWER(name) = LOWER(?)', req.user.shop_id, name);
  if (existing) {
    if (existing.active) return res.status(409).json({ error: 'conflict', message: 'Department already exists' });
    // Reactivate the soft-deleted row so its history stays in one place.
    await run('UPDATE departments SET active = 1 WHERE id = ?', existing.id);
    await audit(req.user.user_id, 'staff.department.create', 'department', existing.id, `${name} (reactivated)`);
    return res.status(201).json({ data: await get('SELECT * FROM departments WHERE id = ?', existing.id) });
  }
  const id = uid('dept');
  await run('INSERT INTO departments (id, shop_id, name) VALUES (?,?,?)', id, req.user.shop_id, name);
  await audit(req.user.user_id, 'staff.department.create', 'department', id, name);
  res.status(201).json({ data: await get('SELECT * FROM departments WHERE id = ?', id) });
});

router.patch('/departments/:id', requirePermission('staff.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM departments WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const { name, active } = req.body || {};
  const sets = []; const args = [];
  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return bad(res, 'department name is required');
    const dup = await get('SELECT id FROM departments WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND id <> ?', req.user.shop_id, clean, cur.id);
    if (dup) return res.status(409).json({ error: 'conflict', message: 'Department already exists' });
    sets.push('name = ?'); args.push(clean);
  }
  if (active !== undefined) { sets.push('active = ?'); args.push(active ? 1 : 0); }
  if (!sets.length) return bad(res, 'nothing to update');
  args.push(cur.id);
  await run(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await audit(req.user.user_id, 'staff.department.update', 'department', cur.id, `${cur.name}: ${active === 0 ? 'deactivated' : 'updated'}`);
  res.json({ data: await get('SELECT * FROM departments WHERE id = ?', cur.id) });
});

router.get('/designations', requirePermission('staff.view'), async (req, res) => {
  const rows = await all(
    `SELECT g.*, (
       SELECT COUNT(*)::int FROM employees e WHERE e.designation_id = g.id AND e.status <> 'exited'
     ) AS employee_count
     FROM designations g WHERE g.shop_id = ? ORDER BY g.active DESC, g.name`,
    req.user.shop_id
  );
  res.json({ data: rows });
});

router.post('/designations', requirePermission('staff.manage'), async (req, res) => {
  const { name, grade } = req.body || {};
  const clean = String(name || '').trim();
  if (!clean) return bad(res, 'designation name is required');
  const existing = await get('SELECT * FROM designations WHERE shop_id = ? AND LOWER(name) = LOWER(?)', req.user.shop_id, clean);
  if (existing) {
    if (existing.active) return res.status(409).json({ error: 'conflict', message: 'Designation already exists' });
    await run('UPDATE designations SET active = 1, grade = ? WHERE id = ?',
      grade ? String(grade).trim() : existing.grade, existing.id);
    await audit(req.user.user_id, 'staff.designation.create', 'designation', existing.id, `${clean} (reactivated)`);
    return res.status(201).json({ data: await get('SELECT * FROM designations WHERE id = ?', existing.id) });
  }
  const id = uid('desig');
  await run(
    'INSERT INTO designations (id, shop_id, name, grade) VALUES (?,?,?,?)',
    id, req.user.shop_id, clean, grade ? String(grade).trim() : null
  );
  await audit(req.user.user_id, 'staff.designation.create', 'designation', id, clean);
  res.status(201).json({ data: await get('SELECT * FROM designations WHERE id = ?', id) });
});

router.patch('/designations/:id', requirePermission('staff.manage'), async (req, res) => {
  const cur = await get('SELECT * FROM designations WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const { name, grade, active } = req.body || {};
  const sets = []; const args = [];
  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return bad(res, 'designation name is required');
    const dup = await get('SELECT id FROM designations WHERE shop_id = ? AND LOWER(name) = LOWER(?) AND id <> ?', req.user.shop_id, clean, cur.id);
    if (dup) return res.status(409).json({ error: 'conflict', message: 'Designation already exists' });
    sets.push('name = ?'); args.push(clean);
  }
  if (grade !== undefined) { sets.push('grade = ?'); args.push(String(grade).trim() || null); }
  if (active !== undefined) { sets.push('active = ?'); args.push(active ? 1 : 0); }
  if (!sets.length) return bad(res, 'nothing to update');
  args.push(cur.id);
  await run(`UPDATE designations SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await audit(req.user.user_id, 'staff.designation.update', 'designation', cur.id, `${cur.name}: ${active === 0 ? 'deactivated' : 'updated'}`);
  res.json({ data: await get('SELECT * FROM designations WHERE id = ?', cur.id) });
});

// Make sure a shop always has its role catalogue before the first user is
// created (useful after a fresh migration, before the seed script runs).
router.post('/bootstrap', requirePermission('roles.manage'), async (req, res) => {
  await ensureRbac(req.user.shop_id);
  res.json({ ok: true });
});

module.exports = router;
