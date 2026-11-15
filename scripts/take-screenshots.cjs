const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function login() {
  return new Promise((resolve, reject) => {
    const email = process.env.DEMO_ADMIN_EMAIL || 'admin@marvelsoftware.local';
    const password = process.env.DEMO_ADMIN_PASSWORD || 'Admin@123';
    const data = JSON.stringify({ email, password });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.token);
          } catch (e) {
            reject(new Error('Failed to parse login response: ' + body));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  console.log('[1/4] Authenticating with API...');
  const token = await login();
  console.log('✓ Token obtained successfully.');

  console.log('[2/4] Launching Headless Chrome...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Capture Login page first before auth token is injected
  console.log('[3/4] Capturing Login page...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(screenshotsDir, '01_login.png'), fullPage: true });
  console.log('  ✓ 01_login.png');

  // Inject auth token into localStorage
  await page.evaluate((tok) => {
    localStorage.setItem('erp_token', tok);
  }, token);

  const pagesToCapture = [
    { name: '02_overview_dashboard', url: 'http://localhost:5173/admin' },
    { name: '03_staff_users', url: 'http://localhost:5173/admin/staff' },
    { name: '04_staff_roles', url: 'http://localhost:5173/admin/staff/roles' },
    { name: '05_staff_departments', url: 'http://localhost:5173/admin/staff/departments' },
    { name: '06_staff_designations', url: 'http://localhost:5173/admin/staff/designations' },
    { name: '07_hr_employees', url: 'http://localhost:5173/admin/hr/employees' },
    { name: '08_hr_attendance', url: 'http://localhost:5173/admin/hr/attendance' },
    { name: '09_hr_leaves', url: 'http://localhost:5173/admin/hr/leaves' },
    { name: '10_hr_payroll', url: 'http://localhost:5173/admin/hr/payroll' },
    { name: '11_crm_customers', url: 'http://localhost:5173/admin/customers' },
    { name: '12_company_settings', url: 'http://localhost:5173/admin/settings' },
    { name: '13_audit_trail', url: 'http://localhost:5173/admin/audit' },
    { name: '14_inventory_placeholder', url: 'http://localhost:5173/admin/inventory' },
    { name: '15_finance_placeholder', url: 'http://localhost:5173/admin/finance' },
  ];

  console.log(`[4/4] Capturing ${pagesToCapture.length} authenticated workspace screens...`);
  for (const item of pagesToCapture) {
    await page.goto(item.url, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: path.join(screenshotsDir, `${item.name}.png`), fullPage: false });
    console.log(`  ✓ ${item.name}.png`);
  }

  await browser.close();
  console.log('\nAll screenshots captured successfully in /screenshots!');
}

run().catch((err) => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
