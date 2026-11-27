import { type Page } from '@playwright/test';

export const ADMIN = { user_id: 'manager-test', email: 'manager@example.test', display_name: 'Asha Manager', role: 'admin', role_name: 'Administrator', shop_id: 'sample-company', permissions: ['*'] };
export const EMPLOYEE = { ...ADMIN, user_id: 'employee-test', email: 'employee@example.test', display_name: 'Dev Employee', role: 'staff', role_name: 'Employee', permissions: [] as string[] };
export const SALES_REPORT = { from: '2026-11-01T00:00:00Z', to: '2026-12-01T00:00:00Z', revenue: 12500, bill_count: 5, avg_bill: 2500, unique_customers: 3, items_sold: 10, gross_profit_estimate: null, byDay: [{ d: '2026-11-20', bills: 2, revenue: 5000 }, { d: '2026-11-21', bills: 3, revenue: 7500 }], byCat: [{ category: 'Supplies', pieces: 10, revenue: 12500 }], byPay: [{ method: 'upi', total: 12500 }] };

export async function mockWorkspace(page: Page, user = ADMIN) {
  await page.addInitScript(() => localStorage.setItem('erp_token', 'synthetic-test-token'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user } });
    if (path === '/api/config') return route.fulfill({ json: { data: { product_name: 'MarvelSoftware', timezone: 'Asia/Kolkata' } } });
    if (path === '/api/dashboard') return route.fulfill({ json: { data: { month: '2026-11', headcount: 24, present_today: 21, pending_leaves: 3, payroll_net: 450000, customers: 18, open_leads: 7, overdue_follow_ups: 0, open_support_cases: 2, active_items: 12, revenue_month: 320000, recent_activity: [] } } });
    if (path === '/api/reports/sales') return route.fulfill({ json: { data: SALES_REPORT } });
    if (path === '/api/reports/customers') return route.fulfill({ json: { data: { total: 18, new_customers: 3, repeat_customers: 5, repeat_rate: 5 / 18 } } });
    if (path === '/api/reports/inventory') return route.fulfill({ json: { data: { byCat: [{ category: 'Supplies', pieces: 12 }], low_stock: [] } } });
    if (path === '/api/reports/category-products') return route.fulfill({ json: { data: [], summary: { pieces: 0, revenue: 0, customers: 0 } } });
    return route.fulfill({ json: { data: [], total: 0 } });
  });
}

export class Workspace {
  constructor(readonly page: Page) {}
  get finder() { return this.page.getByRole('dialog', { name: 'Find a page' }); }
  get passwordDialog() { return this.page.getByRole('dialog', { name: 'Change password' }); }
  async goto(path = '/admin') { await this.page.goto(path); }
}
