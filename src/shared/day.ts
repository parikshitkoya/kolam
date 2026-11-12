// UTC day arithmetic. Day 1 is Monday 23 November 2026.

export const EPOCH_UTC = Date.UTC(2026, 10, 23);
export const DAY_MS = 86400000;

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Day number for a timestamp; may be <= 0 before launch. */
export const dayNumber = (nowMs: number): number => Math.floor((nowMs - EPOCH_UTC) / DAY_MS) + 1;

const dateAt = (day: number): Date => new Date(EPOCH_UTC + (day - 1) * DAY_MS);

/** 0 = Monday ... 6 = Sunday, from the UTC calendar date. */
export const weekdayOf = (day: number): number => (dateAt(day).getUTCDay() + 6) % 7;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' (UTC). */
export const dateOf = (day: number): string => {
  const d = dateAt(day);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/** e.g. 'Monday 23 November' (UTC, locale-independent). */
export const dateLabel = (day: number): string => {
  const d = dateAt(day);
  const wd = WEEKDAY_NAMES[weekdayOf(day)] ?? '';
  const month = MONTH_NAMES[d.getUTCMonth()] ?? '';
  return `${wd} ${d.getUTCDate()} ${month}`;
};

/** Milliseconds until the next UTC midnight. */
export const msUntilNextDay = (nowMs: number): number => {
  const r = (((nowMs - EPOCH_UTC) % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - r;
};
