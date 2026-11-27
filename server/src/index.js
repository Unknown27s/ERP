const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('express-async-errors'); // forward async route throws to the error middleware (else one bad query kills the process)
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { get, all, initDb } = require('./db');
const bcrypt = require('bcryptjs');

// Fail closed immediately if JWT_SECRET is unset or weak (C2)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET must be set in environment and contain at least 32 characters. Cannot start in insecure mode.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 'loopback'); // Fix H4: Real client IP from reverse proxy

// Fix H5: Security headers (CSP, HSTS, X-Frame-Options, noSniff)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Fix H3: Restrict CORS to allowed origins
const allowedOrigins = (process.env.APP_ORIGIN || 'http://localhost:5173,http://localhost:4000,http://127.0.0.1:5173,http://127.0.0.1:4000')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`Blocked by CORS policy: Origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' })); // Safer 2MB limit (H6)
// Redact query strings from logs to prevent PII/token exposure (M7)
morgan.token('clean-url', (req) => {
  const url = req.originalUrl || req.url || '';
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
});
app.use(morgan(':method :clean-url :status :res[content-length] - :response-time ms'));

// Schema is ensured via app.ready (awaited on boot and in tests).
app.ready = initDb();

// Public demo roster for the sign-in screen. It lists the existing seeded person
// accounts so a reviewer can pick a real login instead of a separate "preview@"
// mailbox. The roster is on by default, including production, and can be turned
// off explicitly with PREVIEW_LOGIN=0. Override the roster with
// PREVIEW_EMAILS=a@x,b@y and the passwords with PREVIEW_PASSWORDS=a@x:pass,...
//
// Only the fixed demo mailbox allowlist is exposed, and each password is checked
// against the stored bcrypt hash before it is returned. Accounts whose password
// has been changed, disabled accounts, and every other staff account stay hidden.
const PREVIEW_EMAILS = [
  'admin@marvelsoftware.local',
  'manager@marvelsoftware.local',
  'hr@marvelsoftware.local',
  'finance@marvelsoftware.local',
  'store@marvelsoftware.local',
  'sales@marvelsoftware.local',
  'employee@marvelsoftware.local',
];
const PREVIEW_PASSWORDS = {
  'admin@marvelsoftware.local': 'Admin@123',
  'manager@marvelsoftware.local': 'Manager@123',
  'hr@marvelsoftware.local': 'Hr@12345',
  'finance@marvelsoftware.local': 'Finance@123',
  'store@marvelsoftware.local': 'Store@123',
  'sales@marvelsoftware.local': 'Sales@123',
  'employee@marvelsoftware.local': 'Employee@123',
};
const PREVIEW_ROLE_ORDER = ['Administrator', 'Manager', 'HR', 'Finance', 'Store', 'Sales', 'Employee'];

/** env override: PREVIEW_PASSWORDS="a@x:pass,b@y:pass" */
function previewPasswords() {
  const overrides = {};
  for (const pair of String(process.env.PREVIEW_PASSWORDS || '').split(',')) {
    const idx = pair.indexOf(':');
    if (idx <= 0) continue;
    overrides[pair.slice(0, idx).trim().toLowerCase()] = pair.slice(idx + 1);
  }
  return { ...PREVIEW_PASSWORDS, ...overrides };
}

async function loadPreviewAccounts(shopId) {
  // Explicit opt-out for deployments that must not publish demo credentials.
  if (process.env.PREVIEW_LOGIN === '0' || !shopId) return [];
  const emails = (process.env.PREVIEW_EMAILS || PREVIEW_EMAILS.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return [];
  const passwords = previewPasswords();
  try {
    const rows = await all(
      `SELECT p.display_name, p.email, p.password_hash, COALESCE(r.name, p.role) AS role_name
          FROM profiles p LEFT JOIN roles r ON r.id = p.role_id
         WHERE p.active = 1 AND p.shop_id = ? AND lower(p.email) IN (${emails.map(() => '?').join(',')})`,
      shopId, ...emails
    );
    rows.sort((a, b) => {
      const ai = PREVIEW_ROLE_ORDER.indexOf(a.role_name);
      const bi = PREVIEW_ROLE_ORDER.indexOf(b.role_name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || String(a.display_name).localeCompare(String(b.display_name));
    });
    const verified = await Promise.all(rows.map(async (r) => {
      const email = String(r.email).toLowerCase();
      const password = passwords[email];
      if (!password || !r.password_hash || !(await bcrypt.compare(password, r.password_hash))) return null;
      return {
        name: r.display_name,
        email: r.email,
        role: r.role_name,
        password,
      };
    }));
    return verified.filter(Boolean);
  } catch (e) {
    console.error('[config] preview roster unavailable:', e.message);
    return [];
  }
}

// Public branding only — no business data. The browser needs this before login
// so a rename in Settings is reflected immediately.
app.get('/api/config', async (req, res, next) => {
  try {
    if (process.env.PREVIEW_LOGIN !== '0') res.set('Cache-Control', 'no-store');
    const shop = await get('SELECT id FROM shops WHERE name = ? ORDER BY id LIMIT 1',
      process.env.COMPANY_NAME || 'MarvelSoftware') || await get('SELECT id FROM shops ORDER BY id LIMIT 1');
    const accounts = await loadPreviewAccounts(shop?.id);
    const preview = { enabled: accounts.length > 0, accounts };
    if (!shop) return res.json({ data: { product_name: 'MarvelSoftware', company_name: 'MarvelSoftware', preview } });
    const { getSettings } = require('./routes/admin');
    const s = await getSettings(shop.id);
    res.json({
      data: {
        product_name: s.product_name || s.company_name || s.shop_name || 'MarvelSoftware',
        company_name: s.company_name || s.shop_name || 'MarvelSoftware',
        timezone: s.timezone,
        currency: s.currency,
        preview,
      },
    });
  } catch (e) { next(e); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, status: 'healthy', time: new Date().toISOString() }));

// Legacy public catalogue endpoints were removed in Phase 1. Answer with a
// truthful 404 straight away; otherwise they would fall through to a module
// router whose blanket auth middleware would report a misleading 401.
app.use('/api/public', (req, res) => res.status(404).json({ error: 'not_found' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin', require('./routes/email'));
app.use('/api/admin', require('./routes/occasions'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/hr', require('./routes/hr'));
app.use('/api/employee', require('./routes/employee'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api', require('./routes/dashboard'));
app.use('/api', require('./routes/generic-commerce'));
app.use('/api', require('./routes/catalog'));
app.use('/api', require('./routes/ops'));
app.use('/api', require('./routes/sales'));
app.use('/api', require('./routes/crm'));
app.use('/api', require('./routes/crm-pipeline'));

app.get('/api/version', (req, res) => res.json({ ok: true }));

// Consistent error shape (§9)
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '23505') return res.status(409).json({ error: 'conflict', message: 'A record with these unique details already exists' });
  if (['23503', '23514', '22007', '22008', '22P02'].includes(err.code)) return res.status(400).json({ error: 'bad_request', message: 'Invalid field value or related record' });
  if ([400, 403, 404, 409, 422].includes(err.status)) return res.status(err.status).json({ error: 'request_failed', message: err.message });
  res.status(500).json({ error: 'internal', message: 'Unexpected error', correlationId: Date.now().toString(36) });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.ready.then(() => {
    const srv = app.listen(PORT, () => console.log(`[server] ERP API on http://localhost:${PORT} (db: Postgres)`));
    // In-process scheduler: sends approved campaigns whose schedule_at has
    // arrived. Started only on a real boot (never on module import) so tests
    // do not spawn background timers.
    require('./services/campaigns').startCampaignScheduler();
    srv.on('error', (e) => {
      if (e && e.code === 'EADDRINUSE') {
        console.error(`[server] Port ${PORT} is already in use — kill the old process first:  lsof -ti:${PORT} | xargs kill -9`);
        process.exit(1);
      }
      throw e;
    });
  }).catch((e) => { console.error('[server] DB init failed:', e.message); process.exit(1); });
}
module.exports = app;
