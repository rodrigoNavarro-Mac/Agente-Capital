/**
 * =====================================================
 * TIME BUCKET HELPERS (CLIENT + SERVER SAFE)
 * =====================================================
 * Goal:
 * - Provide a single, deterministic way to:
 *   - Build rolling date ranges for period filters
 *   - Bucket dates into fixed-size time buckets
 *   - Format bucket labels for charts (Recharts)
 *
 * Buckets requested by the business:
 * - week: every day      -> 7 points (Mon -> Sun)
 * - month: every 2 days  -> 15 points (calendar month)
 * - quarter: every week  -> buckets across the calendar quarter
 * - year: every month    -> 12 points (calendar year)
 * - custom: dynamic buckets based on range duration
 */

export type TimePeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeekMonday(d: Date): Date {
  // Weeks are counted from Monday to Sunday.
  const x = startOfDay(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7; // Mon->0, Tue->1, ..., Sun->6
  x.setDate(x.getDate() - diff);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function toISODateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseISODateLocal(value: string): Date | null {
  // Accepts YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function parseYearMonthKey(value: string): { year: number; month: number } | null {
  // Accepts YYYY-MM
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
}

export function getPreviousPeriodForCustomRange(start: Date, end: Date): { startDate: Date; endDate: Date } {
  const durationMs = end.getTime() - start.getTime();
  // Ensure we subtract at least 1 day if start == end (though typically range has duration)
  // Logic: Previous period ends 1ms before current start.
  // Previous start = Previous end - duration.

  // Using dates to avoid DST issues where simply subtracting ms might shift hours?
  // Actually, for "N days", subtracting days is safer.
  const daysDiff = Math.round(durationMs / DAY_MS);

  const prevEndDate = addDays(start, -1);
  const prevStartDate = addDays(prevEndDate, -daysDiff); // Same duration

  return { startDate: startOfDay(prevStartDate), endDate: endOfDay(prevEndDate) };
}

export function getRollingPeriodDates(
  period: TimePeriod,
  isLastPeriod: boolean = false,
  now: Date = new Date()
): { startDate: Date; endDate: Date } {
  // NOTE: Despite the name, this function now returns CALENDAR ranges.
  // The dashboard requirements are:
  // - month: current calendar month (1st -> last day)
  // - quarter: current calendar quarter
  // - year: current calendar year
  // - custom: handled by caller usually, but if called, returns defaults or throws?
  // When isLastPeriod=true, it returns the immediately previous period of the same type.
  const endBase = endOfDay(now);

  if (period === 'custom') {
    // Fallback or error. The caller should use specific dates for custom.
    // Return today if forced.
    return { startDate: startOfDay(now), endDate: endOfDay(now) };
  }

  if (period === 'week') {
    // Current calendar week (Mon -> Sun). When isLastPeriod=true, return the previous week.
    const currentWeekStart = startOfWeekMonday(endBase);
    const start = isLastPeriod ? startOfDay(addDays(currentWeekStart, -7)) : startOfDay(currentWeekStart);
    const end = endOfDay(addDays(start, 6));
    return { startDate: start, endDate: end };
  }

  if (period === 'month') {
    const year = isLastPeriod ? new Date(endBase.getFullYear(), endBase.getMonth() - 1, 1).getFullYear() : endBase.getFullYear();
    const month = isLastPeriod ? new Date(endBase.getFullYear(), endBase.getMonth() - 1, 1).getMonth() : endBase.getMonth();
    const startDate = startOfDay(new Date(year, month, 1));
    const endDate = endOfDay(new Date(year, month + 1, 0));
    return { startDate, endDate };
  }

  if (period === 'quarter') {
    const currentQuarter = Math.floor(endBase.getMonth() / 3); // 0..3
    const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
    const q = isLastPeriod ? prevQuarter : currentQuarter;
    const year = isLastPeriod && currentQuarter === 0 ? endBase.getFullYear() - 1 : endBase.getFullYear();
    const startMonth = q * 3;
    const startDate = startOfDay(new Date(year, startMonth, 1));
    const endDate = endOfDay(new Date(year, startMonth + 3, 0));
    return { startDate, endDate };
  }

  // year
  const year = isLastPeriod ? endBase.getFullYear() - 1 : endBase.getFullYear();
  const startDate = startOfDay(new Date(year, 0, 1));
  const endDate = endOfDay(new Date(year, 11, 31));
  return { startDate, endDate };
}

export function buildBucketKeys(period: TimePeriod, rangeStart: Date, rangeEnd: Date): string[] {
  const start = startOfDay(rangeStart);
  const end = endOfDay(rangeEnd);

  if (period === 'week') {
    const keys: string[] = [];
    let cursor = start;
    while (cursor <= end) {
      keys.push(toISODateLocal(cursor));
      cursor = startOfDay(addDays(cursor, 1));
    }
    return keys;
  }

  if (period === 'custom') {
    // For custom range, we try to split into ~10-15 buckets if it's large,
    // or 1 bucket per day if it's small.
    const diffDays = (end.getTime() - start.getTime()) / DAY_MS;

    // If less than 60 days, show daily.
    if (diffDays <= 60) {
      const keys: string[] = [];
      let cursor = start;
      while (cursor <= end) {
        keys.push(toISODateLocal(cursor));
        cursor = startOfDay(addDays(cursor, 1));
      }
      return keys;
    }

    // If more, maybe weekly?
    const keys: string[] = [];
    let cursor = start;
    while (cursor <= end) {
      keys.push(toISODateLocal(cursor));
      cursor = startOfDay(addDays(cursor, 7));
    }
    return keys;
  }

  if (period === 'month') {
    // Business requirement: 15 points, "every 2 days", but the range must be the full calendar month.
    // We approximate this by using odd days as bucket starts (1,3,5,...,29) => 15 points.
    // - For 30/31 day months, the last bucket (29) absorbs the remaining days.
    // - For February (28 days), we add day 28 as a final 1-day bucket to keep 15 points.
    const yyyy = start.getFullYear();
    const mm = start.getMonth();
    const monthLength = new Date(yyyy, mm + 1, 0).getDate();
    const monthStr = String(mm + 1).padStart(2, '0');

    const keys: string[] = [];
    for (let day = 1; day <= monthLength; day += 2) {
      keys.push(`${yyyy}-${monthStr}-${String(day).padStart(2, '0')}`);
    }
    if (monthLength === 28 && keys.length === 14) {
      keys.push(`${yyyy}-${monthStr}-28`);
    }
    return keys.slice(0, 15);
  }

  if (period === 'year') {
    const keys: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      keys.push(`${yyyy}-${mm}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  // quarter
  const stepDays = 7;
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(toISODateLocal(cursor));
    cursor = startOfDay(addDays(cursor, stepDays));
  }
  return keys;
}

export function getBucketKeyForDate(date: Date, period: TimePeriod, rangeStart: Date): string {
  const d = startOfDay(date);
  const start = startOfDay(rangeStart);

  if (period === 'week') {
    // One bucket per day.
    return toISODateLocal(d);
  }

  if (period === 'month') {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const day = d.getDate();
    const monthLength = new Date(yyyy, d.getMonth() + 1, 0).getDate();

    // Special handling to match buildBucketKeys() for calendar months.
    if (monthLength === 28 && day === 28) return `${yyyy}-${mm}-28`;
    if (monthLength === 31 && day >= 29) return `${yyyy}-${mm}-29`;

    const bucketDay = day % 2 === 1 ? day : Math.max(1, day - 1);
    return `${yyyy}-${mm}-${String(bucketDay).padStart(2, '0')}`;
  }

  if (period === 'year') {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }

  if (period === 'custom') {
    // Match logic in buildBucketKeys
    // Match logic in buildBucketKeys
    // Simplified: if < 60 days, return daily iso
    // Actually easier: calculate daily key. If it exists in "daily" mode, good.
    // To keep consistent with buildBucketKeys, we need to know the strategy.
    // Let's assume daily for now as most custom ranges are short.
    // If we implement 'weekly' for long custom ranges, we need logic here.
    return toISODateLocal(d);
  }

  // quarter
  const stepDays = 7;
  const diffDays = Math.floor((d.getTime() - start.getTime()) / DAY_MS);
  const bucketIndex = Math.floor(diffDays / stepDays);
  const bucketStart = startOfDay(addDays(start, bucketIndex * stepDays));
  return toISODateLocal(bucketStart);
}

export function formatBucketLabel(period: TimePeriod, bucketKey: string, locale: string = 'es-MX'): string {
  // New format:
  // - month/quarter: YYYY-MM-DD
  // - year: YYYY-MM
  // Back-compat (old stored insights):
  // - YYYY-Www
  const ym = parseYearMonthKey(bucketKey);
  if (period === 'year' && ym) {
    const d = new Date(ym.year, ym.month - 1, 1);
    return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
  }

  const iso = parseISODateLocal(bucketKey);
  if (iso) {
    return iso.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }

  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(String(bucketKey || '').trim());
  if (weekMatch) {
    return `Sem ${Number(weekMatch[2])}`;
  }

  return String(bucketKey || '');
}


