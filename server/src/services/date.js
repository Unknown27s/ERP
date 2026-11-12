/**
 * Date helpers for a single-company deployment in India.
 *
 * Business dates are date-only (`YYYY-MM-DD`). Building them from the server's
 * local clock or from `toISOString()` shifts the day around midnight, so use the
 * company time zone explicitly. `APP_TIMEZONE` can override the default.
 */
const TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/** `YYYY-MM-DD` for the given instant in the company time zone. */
function dateInTz(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** `YYYY-MM-DD` for today in the company time zone. */
function today() {
  return dateInTz(new Date(), TIME_ZONE);
}

/** `YYYY-MM` for the current month in the company time zone. */
function currentMonth() {
  return today().slice(0, 7);
}

module.exports = { TIME_ZONE, dateInTz, today, currentMonth };
