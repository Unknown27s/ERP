const jwt = require('jsonwebtoken');
const { get, run, uid } = require('../db');
const { permissionsForProfile, hasPermission } = require('../services/rbac');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-please-32chars';

function sign(user) {
  return jwt.sign({ sub: user.user_id, role: user.role, shop_id: user.shop_id, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
}

async function auth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.query.token || null);
    if (!token) return res.status(401).json({ error: 'unauthenticated', message: 'Missing bearer token' });
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await get('SELECT * FROM profiles WHERE user_id = ? AND active = 1', payload.sub);
    if (!row) return res.status(401).json({ error: 'unauthenticated', message: 'User disabled' });
    const permissions = await permissionsForProfile(row);
    const role = row.role_id
      ? await get('SELECT id, name FROM roles WHERE id = ?', row.role_id)
      : null;
    req.user = {
      user_id: row.user_id,
      role: row.role,
      role_id: row.role_id,
      role_name: role ? role.name : (row.role === 'admin' ? 'Administrator' : 'Sales'),
      shop_id: row.shop_id,
      email: row.email,
      display_name: row.display_name,
      permissions,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'unauthenticated', message: 'Invalid token' });
  }
}

/**
 * @deprecated Kept only for backward compatibility with older imports.
 * No route uses this any more: every protected route names a permission via
 * `requirePermission` / `requireAnyPermission`. Prefer those for new work.
 *
 * Legacy role hierarchy: owner > manager > inventory/billing.
 */
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (req.user.role === 'admin') return next();
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'forbidden', message: `Requires role: ${roles.join('/')}` });
  };
}

/**
 * Server-side permission gate. Every protected route must name the permission
 * it needs — the matching UI is only a convenience.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (hasPermission(req.user.permissions, permission)) return next();
    return res.status(403).json({
      error: 'forbidden',
      message: `Requires permission: ${permission}`,
      required: permission,
    });
  };
}

/** Allow a route when the caller holds at least one of the named permissions. */
function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (permissions.some((p) => hasPermission(req.user.permissions, p))) return next();
    return res.status(403).json({
      error: 'forbidden',
      message: `Requires one of: ${permissions.join(', ')}`,
      required: permissions,
    });
  };
}

async function audit(actorId, action, entityType, entityId, summary, reason = null) {
  try {
    await run(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, summary, reason)
      VALUES (?,?,?,?,?,?,?)`, uid('aud'), actorId, action, entityType, entityId, summary, reason);
  } catch { /* audit must never break the caller */ }
}

module.exports = { sign, auth, requireRoles, requirePermission, requireAnyPermission, audit, JWT_SECRET };
