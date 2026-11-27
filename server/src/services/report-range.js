const { get } = require('../db');
const { dateInTz, TIME_ZONE } = require('./date');
const { getSettings } = require('../routes/admin');

const DAYS = { today: 1, week: 7, month: 30, '3m': 90, '6m': 180, '1y': 365 };
const invalid = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Inclusive company calendar dates, represented by an exclusive timestamp end. */
async function reportRange(req) {
  const settings = await getSettings(req.user.shop_id);
  const timezone = settings.timezone || TIME_ZONE;
  const { preset = 'month', from, to } = req.query;
  let fromDate, toDate;
  if (from !== undefined || to !== undefined) {
    if (!validDate(from) || !validDate(to) || from > to) invalid('Choose real from/to dates in YYYY-MM-DD order');
    fromDate = from; toDate = to;
  } else {
    if (typeof preset !== 'string' || !Object.prototype.hasOwnProperty.call(DAYS, preset)) invalid('Invalid report period');
    toDate = dateInTz(new Date(), timezone);
    fromDate = new Date(Date.parse(`${toDate}T00:00:00Z`) - (DAYS[preset] - 1) * 86400000).toISOString().slice(0, 10);
  }
  const bounds = await get(`SELECT (?::date::timestamp AT TIME ZONE ?) AS starts_at,
    ((?::date + INTERVAL '1 day') AT TIME ZONE ?) AS ends_at`, fromDate, timezone, toDate, timezone);
  return { s: bounds.starts_at.toISOString(), e: bounds.ends_at.toISOString(), timezone, fromDate, toDate };
}

module.exports = { reportRange };
