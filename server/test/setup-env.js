/**
 * Loads environment files for the test runner before any test module is
 * evaluated. Production/CI can still provide DATABASE_URL directly in the
 * environment; dotenv only fills in values that are missing.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
