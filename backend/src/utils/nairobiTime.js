const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Kenya is UTC+3 year-round (no DST), but the server typically runs in UTC
 * (Render's default). Anything time-of-day sensitive - "day of week",
 * "minutes until class starts" - needs to be computed in Nairobi local
 * time, not server time, or reminders would land 3 hours off.
 */
function getNairobiParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const hour = parts.hour === '24' ? 0 : Number(parts.hour); // Intl quirk: midnight can print as "24"
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: WEEKDAY_INDEX[parts.weekday],
    hour,
    minute: Number(parts.minute),
    minutesSinceMidnight: hour * 60 + Number(parts.minute)
  };
}

function timeStrToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

module.exports = { getNairobiParts, timeStrToMinutes };
