const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('express-async-errors'); // forward async route throws to the error middleware (else one bad query kills the process)
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { get, all, initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// Schema is ensured via app.ready (awaited on boot and in tests).
app.ready = initDb();

// Public branding only — no business data. The browser needs this before login
// so a rename in Settings is reflected immediately.
app.get('/api/config', async (req, res, next) => {
  try {
    const shop = await get('SELECT id FROM shops ORDER BY id LIMIT 1');
    if (!shop) return res.json({ data: { product_name: 'MarvelSoftware', company_name: 'MarvelSoftware' } });
    const { getSettings } = require('./routes/admin');
    const s = await getSettings(shop.id);
    res.json({
      data: {
        product_name: s.product_name || s.company_name || s.shop_name || 'MarvelSoftware',
        company_name: s.company_name || s.shop_name || 'MarvelSoftware',
        timezone: s.timezone,
        currency: s.currency,
      },
    });
  } catch (e) { next(e); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'postgres', time: new Date().toISOString() }));

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
app.use('/api', require('./routes/dashboard'));
app.use('/api', require('./routes/catalog'));
app.use('/api', require('./routes/ops'));
app.use('/api', require('./routes/sales'));
app.use('/api', require('./routes/crm'));
app.use('/api', require('./routes/crm-pipeline'));

app.get('/api/version', (req, res) => res.json({ ok: true }));

// Consistent error shape (§9)
app.use((err, req, res, next) => {
  console.error(err);
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
