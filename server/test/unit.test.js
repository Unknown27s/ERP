const test = require('node:test');
const assert = require('node:assert/strict');

const { dateInTz, today } = require('../src/services/date');

test('company time zone keeps the business date across UTC midnight', () => {
  // 20:00 UTC is already the next day in India (01:30 IST).
  assert.equal(dateInTz(new Date('2026-11-11T20:00:00Z'), 'Asia/Kolkata'), '2026-11-12');
  assert.equal(dateInTz(new Date('2026-11-12T00:30:00Z'), 'Asia/Kolkata'), '2026-11-12');
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
