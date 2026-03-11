/**
 * =====================================================
 * BUSINESS HOURS UTILITY
 * =====================================================
 * Determines if the current time falls within business hours.
 * Used to route Zoho lead webhooks: Cliq thread vs WhatsApp bot.
 *
 * Default rules (configurable via env):
 * - Monday-Friday: 09:00 - 19:00
 * - Saturday: 10:00 - 14:00
 * - Sunday: closed
 *
 * Env configuration (optional):
 * - BUSINESS_HOURS_TZ: IANA timezone (default: America/Cancun)
 * - BUSINESS_HOURS_WEEKDAY: e.g. \"09:00-19:00\"
 * - BUSINESS_HOURS_SATURDAY: e.g. \"10:00-14:00\"
 * - BUSINESS_HOURS_GRACE_MINUTES: extra minutes after closing (default: 10)
 */

const DEFAULT_TZ = 'America/Cancun';
const DEFAULT_GRACE_MINUTES = 10;

function parseTimeRange(spec: string | undefined, fallbackStart: number, fallbackEnd: number): [number, number] {
  if (!spec) return [fallbackStart, fallbackEnd];
  const trimmed = spec.trim();
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return [fallbackStart, fallbackEnd];
  const [, h1, m1, h2, m2] = match;
  const start = parseInt(h1, 10) * 60 + parseInt(m1, 10);
  const end = parseInt(h2, 10) * 60 + parseInt(m2, 10);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return [fallbackStart, fallbackEnd];
  }
  return [start, end];
}

/**
 * Returns true if the current time (in the configured timezone) is within business hours.
 * - Mon-Fri: 09:00 - 19:00 (inclusive start, exclusive end)
 * - Sat: 10:00 - 14:00
 * - Sun: closed (always false)
 */
export function isBusinessHours(now?: Date): boolean {
  const tz = (process.env.BUSINESS_HOURS_TZ || DEFAULT_TZ).trim();
  const graceMinutesRaw = process.env.BUSINESS_HOURS_GRACE_MINUTES;
  const graceMinutesParsed = graceMinutesRaw ? parseInt(graceMinutesRaw, 10) : NaN;
  const graceMinutes = Number.isFinite(graceMinutesParsed) && graceMinutesParsed >= 0 ? graceMinutesParsed : DEFAULT_GRACE_MINUTES;

  const [weekdayStart, weekdayEnd] = parseTimeRange(process.env.BUSINESS_HOURS_WEEKDAY, 9 * 60, 19 * 60);
  const [saturdayStart, saturdayEnd] = parseTimeRange(process.env.BUSINESS_HOURS_SATURDAY, 10 * 60, 14 * 60);
  const date = now ?? new Date();

  // Use Intl so day/hour are in the target timezone, not server local
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(date),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, minute: '2-digit' }).format(date),
    10
  );
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  const totalMinutes = hour * 60 + minute;

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const day = dayMap[weekday] ?? 0;

  if (day === 0) {
    return false; // Sunday: closed
  }

  if (day === 6) {
    // Saturday window + grace
    const start = saturdayStart;
    const end = saturdayEnd + graceMinutes;
    return totalMinutes >= start && totalMinutes < end;
  }

  // Monday-Friday window + grace
  const start = weekdayStart;
  const end = weekdayEnd + graceMinutes;
  return totalMinutes >= start && totalMinutes < end;
}
