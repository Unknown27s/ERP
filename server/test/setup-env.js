/**
 * Loads environment files for the test runner before any test module is
 * evaluated. Production/CI can still provide DATABASE_URL directly in the
 * environment; dotenv only fills in values that are missing.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Guard against executing test fixtures against production database (M8)
if (process.env.NODE_ENV === 'production') {
  console.error('[FATAL] Refusing to run tests with NODE_ENV=production. Aborting.');
  process.exit(1);
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
