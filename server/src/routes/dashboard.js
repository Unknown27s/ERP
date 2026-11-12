const express = require('express');
const { get, all } = require('../db');
const { auth } = require('../middleware/auth');
const { hasPermission } = require('../services/rbac');
const { today, currentMonth } = require('../services/date');

const router = express.Router();
router.use(auth);

const count = async (sql, ...args) => {
  const row = await get(sql, ...args);
  return Number(row?.n || 0);
};

/**
 * One dashboard payload, assembled from real records. Sections a user has no
 * permission to see are returned as null so the UI can hide them honestly.
 */
router.get('/dashboard', async (req, res) => {
  const shop = req.user.shop_id;
  const perms = req.user.permissions;
  const month = currentMonth();
  const todayDate = today();

  const data = {
    month,
    headcount: null,
    present_today: null,
    pending_leaves: null,
    payroll_net: null,
    customers: null,
    open_leads: null,
    overdue_follow_ups: null,
    open_support_cases: null,
    active_items: null,
    inventory_value: null,
    revenue_month: null,
    recent_activity: [],
  };

  if (hasPermission(perms, 'hr.view') || hasPermission(perms, 'leave.view')) {
    data.headcount = await count(
      `SELECT COUNT(*)::int AS n FROM employees WHERE shop_id = ? AND status IN ('active','notice')`, shop
    );
  }
  if (hasPermission(perms, 'hr.view')) {
    data.present_today = await count(
      `SELECT COUNT(*)::int AS n FROM attendance
       WHERE shop_id = ? AND work_date = ? AND status IN ('present','half_day')`, shop, todayDate
    );
  }
  if (hasPermission(perms, 'leave.view')) {
    data.pending_leaves = await count(
      `SELECT COUNT(*)::int AS n FROM leave_requests WHERE shop_id = ? AND status = 'pending'`, shop
    );
  }
  if (hasPermission(perms, 'payroll.view')) {
    const row = await get(
      `SELECT COALESCE(SUM(ps.net_inr),0) AS n FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       WHERE pr.shop_id = ? AND pr.period = ?`, shop, month
    );
    data.payroll_net = Number(row?.n || 0);
  }
  if (hasPermission(perms, 'crm.view')) {
    data.customers = await count(`SELECT COUNT(*)::int AS n FROM customers WHERE shop_id = ?`, shop);
    data.open_leads = await count(
      `SELECT COUNT(*)::int AS n FROM crm_leads
       WHERE shop_id = ? AND active = 1 AND stage NOT IN ('won','lost')`, shop
    );
    data.overdue_follow_ups = await count(
      `SELECT COUNT(*)::int AS n FROM crm_leads
       WHERE shop_id = ? AND active = 1 AND stage NOT IN ('won','lost')
         AND next_follow_up_on IS NOT NULL AND next_follow_up_on < ?`, shop, todayDate
    );
    data.open_support_cases = await count(
      `SELECT COUNT(*)::int AS n FROM crm_support_cases
       WHERE shop_id = ? AND active = 1 AND status IN ('open','pending')`, shop
    );
  }
  if (hasPermission(perms, 'inventory.view')) {
    data.active_items = await count(
      `SELECT COUNT(*)::int AS n FROM products WHERE shop_id = ? AND status = 'available'`, shop
    );
  }
  if (hasPermission(perms, 'finance.view')) {
    const row = await get(
      `SELECT COALESCE(SUM(total_inr),0) AS n FROM sales
       WHERE shop_id = ? AND status = 'finalized' AND sold_at >= ?`, shop, `${month}-01`
    );
    data.revenue_month = Number(row?.n || 0);
  }
  if (hasPermission(perms, 'audit.view')) {
    const rows = await all(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.created_at
       FROM audit_logs a
       WHERE a.actor_id IN (SELECT user_id FROM profiles WHERE shop_id = ?)
       ORDER BY a.created_at DESC LIMIT 8`,
      shop
    );
    data.recent_activity = rows;
  }

  res.json({
    data,
    user: {
      display_name: req.user.display_name,
      role_name: req.user.role_name,
      permissions: perms,
    },
  });
});

module.exports = router;
