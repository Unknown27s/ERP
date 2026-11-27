import { test, expect, type Page } from '@playwright/test';

const admin = {
  user_id: 'ui-test', email: 'test@example.test', display_name: 'Demo Administrator',
  role: 'admin', role_name: 'Administrator', shop_id: 'ui-test', permissions: ['*'],
};

async function mockWorkspace(page: Page, user = admin) {
  await page.addInitScript(() => localStorage.setItem('erp_token', 'ui-test-token'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user } });
    if (path === '/api/config') return route.fulfill({ json: { data: { product_name: 'MarvelSoftware' } } });
    if (path === '/api/admin/email/settings') return route.fulfill({ json: { data: { smtp: { configured: false }, keys: [], templates: {}, defaults: {} } } });
    if (path === '/api/dashboard') return route.fulfill({ json: { data: {
      month: '2026-11', headcount: 24, present_today: 21, pending_leaves: 3,
      payroll_net: 450000, customers: 18, open_leads: 7, overdue_follow_ups: 0,
      open_support_cases: 2, active_items: 12, revenue_month: 320000, recent_activity: [],
    } } });
    return route.fulfill({ json: { data: [] } });
  });
}

class WorkspaceNavigation {
  constructor(readonly page: Page) {}
  get navigation() { return this.page.getByRole('navigation', { name: 'Main navigation' }); }
  get openButton() { return this.page.getByRole('button', { name: 'Open navigation' }); }
  get drawer() { return this.page.getByRole('dialog', { name: 'Workspace navigation' }); }
}

test('desktop uses Inter, the light palette, and a selected overview', async ({ page }, testInfo) => {
  await mockWorkspace(page);
  await page.goto('/admin');
  const ui = new WorkspaceNavigation(page);
  await expect(ui.navigation.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(ui.openButton).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Workspace navigation' })).toHaveCSS('background-color', 'rgb(248, 250, 252)');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('500 12px Inter'))).toBe(true);
  await expect(ui.navigation).toHaveCSS('font-family', /Inter/);
  await ui.navigation.getByRole('button', { name: 'People & access' }).click();
  await expect(ui.navigation.getByRole('link', { name: 'Employees', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop.png') });
});

test('direct staff route opens its group and does not select the parent link', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/admin/staff/roles');
  const ui = new WorkspaceNavigation(page);
  await expect(ui.navigation.getByRole('button', { name: 'People & access' })).toHaveAttribute('aria-expanded', 'true');
  await expect(ui.navigation.getByRole('link', { name: 'Roles & permissions' })).toHaveAttribute('aria-current', 'page');
  await expect(ui.navigation.getByRole('link', { name: 'Users & onboarding' })).not.toHaveAttribute('aria-current');
});

test('mobile drawer closes with Escape, restores focus and closes on navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspace(page);
  await page.goto('/admin');
  const ui = new WorkspaceNavigation(page);
  await expect(ui.navigation).toBeHidden();
  await ui.openButton.click();
  await expect(ui.drawer).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  await page.keyboard.press('Escape');
  await expect(ui.drawer).toBeHidden();
  await expect(ui.openButton).toBeFocused();
  await ui.openButton.click();
  await ui.drawer.getByRole('button', { name: 'People & access' }).click();
  await ui.drawer.getByRole('link', { name: 'Roles & permissions' }).click();
  await expect(page).toHaveURL(/\/admin\/staff\/roles$/);
  await expect(ui.drawer).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('employee navigation does not expose admin modules', async ({ page }) => {
  await mockWorkspace(page, { ...admin, role: 'employee', role_name: 'Employee', permissions: [] });
  await page.goto('/missing-page');
  const ui = new WorkspaceNavigation(page);
  await expect(ui.navigation.getByRole('button', { name: 'My workspace' })).toBeVisible();
  await expect(ui.navigation.getByRole('button', { name: 'People & access' })).toHaveCount(0);
  await expect(ui.navigation.getByRole('link', { name: 'Overview' })).toHaveCount(0);
});

test('login never invents demo people when the server sends none', async ({ page }) => {
  await page.route('**/api/config', (route) => route.fulfill({ json: { data: {} } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Choose a demo person' })).toHaveCount(0);
  await expect(page.getByLabel('Work Email')).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByText('Sample accounts for evaluation.', { exact: false })).toHaveCount(0);
});

test('login renders the server-configured demo roster with credentials', async ({ page }) => {
  await page.route('**/api/config', (route) => route.fulfill({ json: { data: { preview: {
    enabled: true, accounts: [{ name: 'Preview Reviewer', role: 'Manager', email: 'reviewer@example.test', password: 'PreviewTest123!' }],
  } } } }));
  await page.goto('/login');
  const card = page.getByRole('button', { name: 'Preview Reviewer Manager' });
  await expect(card).toContainText('PreviewTest123!');
  await card.click();
  await expect(page.getByLabel('Work Email')).toHaveValue('reviewer@example.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('PreviewTest123!');
});

for (const [role, permissions, visibleGroup, hiddenGroup] of [
  ['Manager', ['hr.view', 'crm.view', 'inventory.view'], 'People & access', 'Administration'],
  ['HR', ['hr.view', 'leave.approve', 'payroll.view'], 'People & access', 'Customers & sales'],
  ['Finance', ['finance.view', 'finance.manage', 'payroll.view'], 'Operations & insights', 'Administration'],
  ['Store', ['inventory.view', 'inventory.manage'], 'Operations & insights', 'People & access'],
  ['Sales', ['crm.view', 'crm.manage', 'inventory.view'], 'Customers & sales', 'People & access'],
] as const) {
  test(`${role} navigation follows granted permissions`, async ({ page }) => {
    await mockWorkspace(page, { ...admin, role_name: role, permissions: [...permissions] });
    await page.goto('/admin');
    const ui = new WorkspaceNavigation(page);
    await expect(ui.navigation.getByRole('button', { name: visibleGroup })).toBeVisible();
    await expect(ui.navigation.getByRole('button', { name: hiddenGroup })).toHaveCount(0);
  });
}

for (const [path, title] of [
  ['/admin/inventory', 'Inventory & purchasing'],
  ['/admin/sales', 'Sales & invoices'],
  ['/admin/finance', 'Finance register'],
  ['/admin/email', 'Email & delivery'],
] as const) {
  test(`${title} renders within the integrated workspace`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mockWorkspace(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('mocked sales checkout reserves quantities and displays the resulting invoice', async ({ page }) => {
  await mockWorkspace(page);
  await page.route('**/api/products?**', (route) => route.fulfill({ json: { data: [{
    id: 'item-1', sku: 'ITEM-1', name: 'Test supplies', selling_price_inr: 100, tax_rate_pct: 5, available_quantity: 5,
  }] } }));
  const sale = { id: 'sale-1', invoice_no: 'DRAFT-1', total_inr: 210, subtotal_inr: 200, tax_inr: 10, discount_inr: 0, status: 'draft', pricing_model: 'generic', sold_at: '2026-11-21', lines: [], payments: [] };
  await page.route('**/api/sales/draft', async (route) => {
    expect(route.request().postDataJSON().lines).toEqual([{ product_id: 'item-1', quantity: '2', discount_inr: '0' }]);
    await route.fulfill({ status: 201, json: { data: sale } });
  });
  await page.route('**/api/sales/sale-1/finalize', async (route) => {
    expect(route.request().postDataJSON().payments).toEqual([{ method: 'cash', amount_inr: 210, reference: '' }]);
    await route.fulfill({ json: { data: { ...sale, invoice_no: 'INV-1', status: 'finalized' } } });
  });
  await page.route('**/api/sales/sale-1', (route) => route.fulfill({ json: { data: { ...sale, invoice_no: 'INV-1', status: 'finalized' } } }));
  await page.goto('/admin/sales');
  await page.getByLabel('Item 1', { exact: true }).selectOption('item-1');
  await page.getByLabel('Quantity 1', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Reserve & review payment' }).click();
  await expect(page.getByRole('heading', { name: 'Payment for DRAFT-1' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByRole('dialog', { name: 'Invoice details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download invoice PDF' })).toBeVisible();
});
