const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Isolate seed logic from the real database and environment files.
function loadSeed(db) {
  const context = {
    module: { exports: {} },
    require: (name) => {
      assert.equal(name, './db');
      return db;
    },
    console: { log() {} },
  };
  vm.runInNewContext(`${read('server/src/seed-hr.js')}
    module.exports.profileByEmail = profileByEmail;
    module.exports.createPayrollRun = createPayrollRun;`, context);
  return context.module.exports;
}

const csvContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('apps/web/src/lib/export.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, csvContext);
const { toCsv } = csvContext.exports;
const column = [{ header: 'Value', value: (row) => row }];

test('CSV quotes delimiters, quotes and newlines and uses CRLF', () => {
  assert.equal(toCsv(column, ['a,b', 'a"b', 'a\nb', null]),
    'Value\r\n"a,b"\r\n"a""b"\r\n"a\nb"\r\n');
});

test('CSV neutralizes formulas, including leading whitespace and controls', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\t=1', '\rtext', '\ntext']) {
    assert.ok(toCsv(column, [value]).includes(`'${value}`), value);
  }
  assert.equal(toCsv([{ header: '=header', value: (v) => v }], ['safe']), "'=header\r\nsafe");
});

test('CSV preserves numeric amounts, text and null values', () => {
  assert.equal(toCsv(column, [-42, 0, 'Meera', undefined]), 'Value\r\n-42\r\n0\r\nMeera\r\n');
});

test('HR seed leaves populated directories and all payroll untouched', async () => {
  const calls = [];
  const fail = async () => { throw new Error('Unexpected write or additional query'); };
  const seed = loadSeed({
    get: async (sql, shopId) => { calls.push([sql, shopId]); return { c: 1 }; },
    all: fail, run: fail, uid: fail,
  });
  await seed.seedHrDemo({ id: 'real-shop' }, { user_id: 'admin' });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /COUNT.*employees WHERE shop_id/);
  assert.equal(calls[0][1], 'real-shop');
});

test('HR seed does not select ambiguous profile emails', async () => {
  for (const profiles of [[], [{ user_id: 'a' }, { user_id: 'b' }]]) {
    const seed = loadSeed({ all: async () => profiles });
    assert.equal(await seed.profileByEmail('shop', 'demo@example.com'), null);
  }
  const profile = { user_id: 'a' };
  const seed = loadSeed({ all: async () => [profile] });
  assert.equal(await seed.profileByEmail('shop', 'demo@example.com'), profile);
});

test('HR seed preserves draft, locked and paid payslips', async () => {
  for (const status of ['draft', 'locked', 'paid']) {
    const seed = loadSeed({
      get: async () => ({ id: 'payroll', status }),
      all: async () => [{ c: 2 }],
      run: async () => { throw new Error('Existing payslips must not change'); },
    });
    const result = await seed.createPayrollRun({ id: 'shop' }, 'admin', '2026-11', status);
    assert.equal(result.created, false);
  }
});

test('employee form uses the registered account-list route', () => {
  const ui = read('apps/web/src/pages/admin/hr/Employees.tsx');
  const route = ui.match(/api\.get\('\/hr([^']*linkable-users)'\)/)?.[1];
  assert.ok(route);
  assert.ok(read('server/src/routes/hr.js').includes(`router.get('${route}', requirePermission('hr.view')`));
});

test('employee-link migration is registered and guards both sides of email matching', () => {
  assert.ok(read('server/src/db.js').includes("'0013_employee_profile_links'"));
  const sql = read('supabase/migrations/0013_employee_profile_links_pg.sql');
  assert.match(sql, /FROM employees candidate/);
  assert.match(sql, /FROM profiles candidate/);
  assert.match(sql, /HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_user_id/);
});
