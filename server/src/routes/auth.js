const express = require('express');
const bcrypt = require('bcryptjs');
const { get, nowFn } = require('../db');
const { sign, auth, audit } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { run } = require('../db');
const { permissionsForProfile } = require('../services/rbac');

const router = express.Router();

async function publicUser(row) {
  const role = row.role_id
    ? await get('SELECT id, name FROM roles WHERE id = ?', row.role_id)
    : null;
  return {
    user_id: row.user_id,
    email: row.email,
    role: row.role,
    role_id: row.role_id,
    role_name: role ? role.name : (row.role === 'admin' ? 'Administrator' : 'Sales'),
    display_name: row.display_name,
    avatar_url: row.avatar_url || null,
    shop_id: row.shop_id,
    permissions: await permissionsForProfile(row),
  };
}

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'bad_request', message: 'email + password required' });
  const row = await get('SELECT * FROM profiles WHERE email = ? AND active = 1', String(email).toLowerCase());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    // Audit failed login attempt (M1)
    await audit(row ? row.user_id : null, 'auth.login.failed', 'profile', row ? row.user_id : null,
      `Failed login attempt for ${String(email).toLowerCase()}`, null, row ? row.shop_id : null, req.ip);
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
  }
  await run(`UPDATE profiles SET last_login_at = ${nowFn()} WHERE user_id = ?`, row.user_id);
  const token = sign(row);
  await audit(row.user_id, 'auth.login', 'profile', row.user_id, `login ${row.email}`, null, row.shop_id, req.ip);
  res.json({ token, user: await publicUser(row) });
});

router.get('/me', auth, (req, res) => res.json({ user: req.user }));
router.post('/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ error: 'bad_request', message: 'New password must contain 12–128 characters' });
  }
  const row = await get('SELECT * FROM profiles WHERE user_id = ?', req.user.user_id);
  if (!bcrypt.compareSync(String(currentPassword || ''), row.password_hash)) return res.status(403).json({ error: 'forbidden', message: 'Current password is incorrect' });
  await run('UPDATE profiles SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?', bcrypt.hashSync(newPassword, 10), row.user_id);
  await audit(row.user_id, 'auth.password.change', 'profile', row.user_id, 'Password changed; sessions revoked');
  res.json({ ok: true });
});
router.post('/logout', auth, async (req, res) => {
  // Invalidate tokens by incrementing token_version (H2)
  await run('UPDATE profiles SET token_version = token_version + 1 WHERE user_id = ?', req.user.user_id);
  await audit(req.user.user_id, 'auth.logout', 'profile', req.user.user_id, 'logout', null, req.user.shop_id, req.ip);
  res.json({ ok: true });
});

module.exports = router;
