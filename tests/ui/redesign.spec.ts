import { test, expect } from '@playwright/test';
import { ADMIN, EMPLOYEE, SALES_REPORT, Workspace, mockWorkspace } from './fixtures';

test('employee profile is a wide rectangular panel with grouped details and edit action', async ({ page }, testInfo) => {
  await mockWorkspace(page);
  const person = { id: 'profile-test', emp_code: 'EMP-021', full_name: 'Test Employee', status: 'active', email: 'employee@example.test', phone: '9876500000', department_name: 'Operations', designation_name: 'Coordinator', joining_date: '2026-01-15', employment_type: 'full_time', salary_structures: [] };
  await page.route('**/api/hr/employees?**', (route) => route.fulfill({ json: { data: [person] } }));
  await page.route('**/api/hr/employees/profile-test', (route) => route.fulfill({ json: { data: person } }));
  await page.route('**/api/hr/employees/profile-test/work?**', (route) => route.fulfill({ json: { data: { summary: { task_count: 0, task_hours: 0, clocked_minutes: 0 }, tasks: [], sessions: [], attendance: [
    { work_date: '2026-11-26', status: 'present', worked_minutes: 485, source: 'manual' },
    { work_date: '2026-11-25', status: 'absent', worked_minutes: 0, source: 'manual' },
    { work_date: '2026-11-24', status: 'half_day', worked_minutes: null, source: null },
  ] } } }));
  await page.goto('/admin/hr/employees');
  await page.getByRole('button', { name: 'Test Employee', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Test Employee', exact: true });
  await expect(profile.getByRole('heading', { name: 'Contact details' })).toBeVisible();
  await expect(profile.getByRole('heading', { name: 'Employment details' })).toBeVisible();
  await expect(profile).toContainText('Full Time');
  const attendance = profile.getByRole('table', { name: /Employee attendance for/ });
  await expect(attendance.getByRole('columnheader')).toHaveText(['Date', 'Status', 'Worked', 'Source']);
  await expect(attendance.getByRole('row')).toHaveCount(4);
  await expect(attendance).toContainText('8h 5m');
  await expect(attendance).toContainText('0h 0m');
  await expect(attendance).toContainText('half day');
  const box = await profile.boundingBox();
  expect(box!.width).toBeGreaterThan(1000);
  await page.screenshot({ path: testInfo.outputPath('employee-profile.png') });
  await profile.getByRole('button', { name: 'Edit employee', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Employee Details', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(profile).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(profile.getByRole('button', { name: 'Close profile' })).toBeVisible();
  expect(await profile.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await profile.getByRole('button', { name: 'Close profile' }).click();
  await expect(profile).toBeHidden();
});

test('page finder supports keyboard navigation and restores focus', async ({ page }) => {
  await mockWorkspace(page);
  const ui = new Workspace(page);
  await ui.goto();
  await page.getByRole('button', { name: 'Find a page', exact: true }).click();
  await expect(ui.finder.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Find a page', exact: true })).toBeFocused();
  await page.keyboard.press('Control+k');
  await ui.finder.getByRole('combobox').fill('Payroll');
  await expect(ui.finder.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/hr\/payroll$/);
  await expect(ui.finder).toBeHidden();
});

test('password dialog contains focus and protects unsaved values', async ({ page }) => {
  await mockWorkspace(page);
  const ui = new Workspace(page);
  await ui.goto();
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(ui.passwordDialog).toBeVisible();
  await ui.passwordDialog.getByRole('button', { name: 'Update password' }).focus();
  await page.keyboard.press('Tab');
  await expect(ui.passwordDialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await ui.passwordDialog.getByLabel('Current password').fill('not-a-real-password');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(ui.passwordDialog.getByLabel('Current password')).toHaveValue('not-a-real-password');
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Escape');
  await expect(ui.passwordDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Change password' })).toBeFocused();
});

test('overview limits primary metrics and uses honest data freshness labels', async ({ page }) => {
  await mockWorkspace(page);
  await page.goto('/admin');
  await expect(page.getByRole('region', { name: 'Key business metrics' }).getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByText('Live Data', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Live Audit Stream' })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Updated');
});

test('inventory never shows empty alongside initial loading or a failed query', async ({ page }) => {
  await mockWorkspace(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/products?**', async (route) => { await gate; await route.fulfill({ status: 500, json: { message: 'Synthetic service failure' } }); });
  await page.goto('/admin/inventory');
  await expect(page.getByRole('region', { name: 'Item register', exact: true }).getByRole('status')).toContainText('Loading records');
  await expect(page.getByText('No items yet', { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toContainText('Synthetic service failure');
  await expect(page.getByText('No items yet', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('customer form labels and errors are associated and nested dialogs close independently', async ({ page }) => {
  await mockWorkspace(page);
  const customer = { id: 'customer-1', customer_code: 'C001', name: 'Synthetic Customer', phone: '9876500000', address_line1: '1 Test Road', city: 'Test City', state: 'KA', postal_code: '560001', marketing_consent: 1, total_spent_inr: 100, purchase_count: 1 };
  await page.route('**/api/customers?**', (route) => route.fulfill({ json: { data: [customer], total: 1 } }));
  await page.route('**/api/customers/customer-1', (route) => route.fulfill({ json: { data: customer } }));
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'New customer', exact: true });
  await form.getByRole('button', { name: 'Save customer' }).click();
  await expect(form.getByLabel('Full name', { exact: true })).toBeFocused();
  await expect(form.getByLabel('Full name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Full name', { exact: true })).toHaveAccessibleDescription('Required');
  await page.keyboard.press('Escape');
  const view = page.getByRole('button', { name: 'View Synthetic Customer', exact: true });
  await view.click();
  const detail = page.getByRole('dialog', { name: customer.name, exact: true });
  await detail.getByRole('button', { name: 'Edit customer', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit C001', exact: true });
  await expect(edit).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Edit customer', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(view).toBeFocused();
});

test('login renders every configured demo person with their actual role', async ({ page }, testInfo) => {
  const accounts = ['Administrator', 'Manager', 'HR', 'Finance', 'Store', 'Sales', 'Employee'].map((role, index) => ({ name: `Person ${index + 1}`, role, email: `person${index + 1}@example.test`, password: `SyntheticOnly${index}!` }));
  await page.route('**/api/config', (route) => route.fulfill({ json: { data: { preview: { enabled: true, accounts } } } }));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /^(Person \d) / })).toHaveCount(7);
  for (const person of accounts) {
    await page.getByRole('button', { name: `${person.name} ${person.role}`, exact: true }).click();
    await expect(page.getByLabel('Work Email')).toHaveValue(person.email);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(person.password);
    await expect(page.getByRole('button', { name: `${person.name} ${person.role}`, exact: true })).toContainText(person.password);
  }
  await page.getByLabel('Search demo people').fill('Finance');
  await expect(page.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Person 4 Finance', exact: true })).toBeVisible();
  await page.getByLabel('Search demo people').fill('');
  await page.screenshot({ path: testInfo.outputPath('login-people.png'), fullPage: true });
});

test('manager assigns work and the employee starts and completes it', async ({ page, browser }, testInfo) => {
  let stored: any = null;
  const taskRoute = async (target: typeof page, currentUser: typeof ADMIN) => {
    await mockWorkspace(target, currentUser);
    await target.route('**/api/tasks**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/assignees')) return route.fulfill({ json: { data: [{ user_id: EMPLOYEE.user_id, display_name: EMPLOYEE.display_name, role_name: 'Employee' }] } });
      if (route.request().method() === 'POST') {
        stored = { ...route.request().postDataJSON(), id: 'task-1', assigned_by: ADMIN.user_id, assigner_name: ADMIN.display_name, assignee_name: EMPLOYEE.display_name, status: 'pending', version: 1, progress_note: '', completed_at: null };
        return route.fulfill({ status: 201, json: { data: stored } });
      }
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        expect(currentUser.user_id).toBe(EMPLOYEE.user_id);
        expect(body.version).toBe(stored.version);
        stored = { ...stored, status: body.status, progress_note: body.note, version: stored.version + 1, completed_at: body.status === 'completed' ? '2026-11-27T10:00:00Z' : null };
        return route.fulfill({ json: { data: stored } });
      }
      return route.fulfill({ json: { data: stored ? [stored] : [], total: stored ? 1 : 0 } });
    });
  };
  await taskRoute(page, ADMIN);
  await page.goto('/admin/tasks');
  await page.getByRole('button', { name: 'Assign task', exact: true }).first().click(); // Header and true-empty CTA have the same action.
  const assign = page.getByRole('dialog', { name: 'Assign task', exact: true });
  await assign.getByLabel('Task title').fill('Review stock receipts');
  await assign.getByLabel('Assign to').selectOption(EMPLOYEE.user_id);
  await assign.getByLabel('Instructions').fill('Check that the supplier references match.');
  await assign.getByRole('button', { name: 'Assign task', exact: true }).click();
  await expect(assign).toBeHidden();
  await expect(page.getByRole('table', { name: 'Assigned tasks', exact: true })).toContainText(EMPLOYEE.display_name);

  const context = await browser.newContext();
  try {
    const employee = await context.newPage();
    await taskRoute(employee, EMPLOYEE);
    await employee.goto('/employee/tasks');
    await expect(employee.getByRole('heading', { name: 'My tasks', exact: true })).toBeVisible();
    await expect(employee.getByRole('button', { name: 'Assign task', exact: true })).toHaveCount(0);
    await employee.getByRole('button', { name: 'View task: Review stock receipts', exact: true }).click();
    const detail = employee.getByRole('dialog', { name: 'Review stock receipts', exact: true });
    await detail.getByRole('button', { name: 'Start task', exact: true }).click();
    await expect(detail.getByText('In progress', { exact: true })).toBeVisible();
    await detail.getByLabel('Progress note').fill('All references checked and matched.');
    await detail.getByRole('button', { name: 'Mark completed', exact: true }).click();
    await expect(detail.getByText('This task is complete.', { exact: true })).toBeVisible();
    await employee.screenshot({ path: testInfo.outputPath('employee-task-completed.png') });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Assigned tasks', exact: true })).toContainText('Completed');
    await page.screenshot({ path: testInfo.outputPath('team-tasks.png') });
  } finally { await context.close(); }
});

test('reports have validated ranges, accessible figures and scoped exports', async ({ page }, testInfo) => {
  await mockWorkspace(page);
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Revenue by day', exact: true })).toBeVisible();
  await page.getByText('View daily sales data', { exact: true }).click();
  await expect(page.getByRole('table', { name: 'Daily sales totals' })).toContainText('₹5,000');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^sales-by-day-.*\.csv$/);
  await page.getByLabel('Reporting period').selectOption('custom');
  await expect(page.getByRole('button', { name: 'Export report CSV', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Pick both dates');
  await page.getByLabel('From', { exact: true }).fill('2026-12-20');
  await page.getByLabel('To', { exact: true }).fill('2026-12-01');
  await expect(page.getByRole('status')).toContainText('end date must be on or after');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  await page.getByLabel('From', { exact: true }).fill('2026-11-01');
  await expect(page.getByRole('heading', { name: 'Revenue by day', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reports-desktop.png'), fullPage: true });
  await page.getByRole('navigation', { name: 'Report categories' }).getByRole('button', { name: /Inventory/ }).click();
  await expect(page.getByLabel('Reporting period')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Current inventory snapshot', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Stock by category', exact: true })).toContainText('Supplies');
});

test('failed report refresh retains previous figures and offers retry', async ({ page }) => {
  await mockWorkspace(page);
  let fail = false;
  await page.route('**/api/reports/sales?**', (route) => route.fulfill(fail ? { status: 500, json: { message: 'Synthetic refresh failure' } } : { json: { data: SALES_REPORT } }));
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Revenue by day', exact: true })).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Showing previously loaded data');
  await expect(page.getByRole('heading', { name: 'Revenue by day', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export report CSV', exact: true })).toBeDisabled();
});

for (const path of ['/admin/reports', '/admin/customers', '/admin/inventory', '/employee/tasks']) {
  test(`${path} reflows at 390px without page overflow`, async ({ page }, testInfo) => {
    await mockWorkspace(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mobile-content.png'), fullPage: true });
  });
}
