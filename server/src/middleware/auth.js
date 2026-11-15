const jwt = require('jsonwebtoken');
const { get, run, uid } = require('../db');
const { permissionsForProfile, hasPermission } = require('../services/rbac');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('[FATAL] JWT_SECRET must be set in environment and contain at least 32 characters. Refusing to run in insecure mode.');
}

function sign(user) {
  return jwt.sign(
    { sub: user.user_id, role: user.role, shop_id: user.shop_id, email: user.email, tv: user.token_version || 1 },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

async function auth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    if (!hdr.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthenticated', message: 'Missing or malformed Bearer authorization token' });
    }
    const token = hdr.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await get('SELECT * FROM profiles WHERE user_id = ? AND active = 1', payload.sub);
    if (!row) return res.status(401).json({ error: 'unauthenticated', message: 'User disabled' });

    // Enforce token revocation (H2)
    if (payload.tv && row.token_version && payload.tv !== row.token_version) {
      return res.status(401).json({ error: 'unauthenticated', message: 'Session revoked. Please sign in again.' });
    }

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
      avatar_url: row.avatar_url || null,
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

async function audit(actorId, action, entityType, entityId, summary, reason = null, shopId = null, ip = null) {
  try {
    await run(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, summary, reason, shop_id, ip_address)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      uid('aud'), actorId, action, entityType, entityId, summary, reason, shopId, ip
    );
  } catch (e) {
    console.error('[audit] failed to write audit log:', e.message);
  }
}

module.exports = { sign, auth, requireRoles, requirePermission, requireAnyPermission, audit, JWT_SECRET };
