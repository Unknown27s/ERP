/**
 * Role-based access control (Phase 1).
 *
 * One permission catalogue is shared by the API and the UI. A user's role is
 * stored on `profiles.role_id`; the role's granted keys live in
 * `role_permissions`. Checks always happen on the server — hiding a button in
 * the browser is not access control.
 *
 * Legacy compatibility: accounts created before the roles table existed have a
 * `profiles.role` of `admin`/`billing` and no role_id. `admin` remains a
 * superuser; `billing` falls back to the Sales role's permissions.
 */
const { all, get, run, uid } = require('../db');

const PERMISSIONS = [
  { key: 'staff.view', module: 'Staff', label: 'View users, roles and org structure' },
  { key: 'staff.manage', module: 'Staff', label: 'Create, edit and deactivate users' },
  { key: 'roles.manage', module: 'Staff', label: 'Create roles and change permissions' },
  { key: 'company.manage', module: 'Settings', label: 'Edit company profile and settings' },
  { key: 'hr.view', module: 'HR', label: 'View employees and HR records' },
  { key: 'hr.manage', module: 'HR', label: 'Create and edit employees and HR records' },
  { key: 'leave.view', module: 'Leave', label: 'View leave requests and balances' },
  { key: 'leave.manage', module: 'Leave', label: 'Create and edit leave policies' },
  { key: 'leave.approve', module: 'Leave', label: 'Approve or reject leave requests' },
  { key: 'finance.view', module: 'Finance', label: 'View ledgers, invoices and reports' },
  { key: 'finance.manage', module: 'Finance', label: 'Post journals, invoices and payments' },
  { key: 'inventory.view', module: 'Inventory', label: 'View items, stock and purchases' },
  { key: 'inventory.manage', module: 'Inventory', label: 'Create items, purchase orders and movements' },
  { key: 'crm.view', module: 'CRM', label: 'View leads, customers and support cases' },
  { key: 'crm.manage', module: 'CRM', label: 'Create and edit leads, customers and orders' },
  { key: 'payroll.view', module: 'Payroll', label: 'View salary structures and payslips' },
  { key: 'payroll.manage', module: 'Payroll', label: 'Run payroll and post salary journals' },
  { key: 'reports.view', module: 'Reports', label: 'View management reports and dashboards' },
  { key: 'audit.view', module: 'Audit', label: 'View the audit trail' },
];

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

const DEFAULT_ROLES = [
  {
    name: 'Administrator',
    description: 'Full access to every module',
    permissions: ALL_KEYS,
  },
  {
    name: 'Manager',
    description: 'Runs day-to-day operations and approves requests',
    permissions: [
      'staff.view', 'company.manage',
      'hr.view', 'hr.manage', 'leave.view', 'leave.manage', 'leave.approve',
      'finance.view', 'inventory.view', 'inventory.manage',
      'crm.view', 'crm.manage', 'payroll.view', 'reports.view', 'audit.view',
    ],
  },
  {
    name: 'HR',
    description: 'Employee lifecycle, leave and payroll',
    permissions: [
      'staff.view', 'hr.view', 'hr.manage', 'leave.view', 'leave.manage',
      'leave.approve', 'payroll.view', 'payroll.manage', 'reports.view',
    ],
  },
  {
    name: 'Finance',
    description: 'Books, invoices, payments and reports',
    permissions: [
      'finance.view', 'finance.manage', 'inventory.view',
      'payroll.view', 'reports.view', 'audit.view',
    ],
  },
  {
    name: 'Store',
    description: 'Items, purchasing and stock movements',
    permissions: ['inventory.view', 'inventory.manage', 'reports.view'],
  },
  {
    name: 'Sales',
    description: 'Leads, customers and sales orders',
    permissions: ['crm.view', 'crm.manage', 'inventory.view', 'reports.view'],
  },
  {
    name: 'Employee',
    description: 'Self-service: own details, tasks, and leave requests',
    permissions: ['leave.view'],
  },
];

/** Create the permission catalogue and default roles for a shop (idempotent). */
async function ensureRbac(shopId) {
  for (const p of PERMISSIONS) {
    await run(
      `INSERT INTO permissions (key, module, label) VALUES (?,?,?)
       ON CONFLICT (key) DO UPDATE SET module = EXCLUDED.module, label = EXCLUDED.label`,
      p.key, p.module, p.label
    );
  }
  for (const role of DEFAULT_ROLES) {
    let row = await get('SELECT id FROM roles WHERE shop_id = ? AND name = ?', shopId, role.name);
    if (!row) {
      row = { id: uid('role') };
      await run(
        `INSERT INTO roles (id, shop_id, name, description, is_system)
         VALUES (?,?,?,?,1)`,
        row.id, shopId, role.name, role.description
      );
    }
    if (role.name === 'Administrator') {
      await run(
        `INSERT INTO role_permissions (role_id, permission_key)
         SELECT ?, key FROM permissions ON CONFLICT DO NOTHING`,
        row.id
      );
    } else {
      for (const key of role.permissions) {
        await run(
          `INSERT INTO role_permissions (role_id, permission_key) VALUES (?,?)
           ON CONFLICT DO NOTHING`,
          row.id, key
        );
      }
    }
  }
}

/** Permission keys for a profile row from `profiles`. */
async function permissionsForProfile(profile) {
  // Legacy superuser rows keep working even before the seed runs.
  if (profile.role === 'admin') return ['*'];

  const roleIds = [];
  if (profile.role_id) roleIds.push(profile.role_id);

  // Union roles from user_roles junction table (Migration 0011)
  try {
    const userRoleRows = await all(
      `SELECT ur.role_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.active = 1`,
      profile.user_id
    );
    for (const ur of userRoleRows) {
      if (!roleIds.includes(ur.role_id)) roleIds.push(ur.role_id);
    }
  } catch { /* if user_roles table is being migrated, fallback gracefully */ }

  if (roleIds.length > 0) {
    const placeholders = roleIds.map(() => '?').join(',');
    const rows = await all(
      `SELECT DISTINCT rp.permission_key
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       WHERE rp.role_id IN (${placeholders}) AND r.active = 1`,
      ...roleIds
    );
    return rows.map((r) => r.permission_key);
  }
  // Legacy `billing` accounts map to the read-only Sales permissions.
  if (profile.role === 'billing') {
    return ['crm.view', 'crm.manage', 'inventory.view', 'reports.view'];
  }
  return [];
}

function hasPermission(permissions, key) {
  return Array.isArray(permissions) && (permissions.includes('*') || permissions.includes(key));
}

module.exports = {
  PERMISSIONS,
  ALL_KEYS,
  DEFAULT_ROLES,
  ensureRbac,
  permissionsForProfile,
  hasPermission,
};
