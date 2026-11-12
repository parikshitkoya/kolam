import { expect, test } from 'vitest';
import { DAY_MS, EPOCH_UTC, WEEKDAY_NAMES, dateLabel, dateOf, dayNumber, msUntilNextDay, weekdayOf } from './day';

test('constants', () => {
  expect(EPOCH_UTC).toBe(Date.UTC(2026, 10, 23));
  expect(DAY_MS).toBe(86400000);
  expect(WEEKDAY_NAMES).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
});

test('dayNumber at UTC boundaries', () => {
  expect(dayNumber(Date.UTC(2026, 10, 23))).toBe(1);
  expect(dayNumber(Date.UTC(2026, 10, 23, 23, 59, 59, 999))).toBe(1);
  expect(dayNumber(Date.UTC(2026, 10, 24))).toBe(2);
  expect(dayNumber(Date.UTC(2026, 10, 12))).toBe(-10);
});

test('weekdayOf (Mon = 0)', () => {
  expect(weekdayOf(1)).toBe(0);
  expect(weekdayOf(7)).toBe(6);
  expect(weekdayOf(8)).toBe(0);
  expect(weekdayOf(-10)).toBe(3);
});

test('dateOf and dateLabel', () => {
  expect(dateOf(1)).toBe('2026-11-23');
  expect(dateOf(10)).toBe('2026-12-02');
  expect(dateLabel(1)).toBe('Monday 23 November');
  expect(dateLabel(10)).toBe('Wednesday 2 December');
});

test('msUntilNextDay', () => {
  expect(msUntilNextDay(Date.UTC(2026, 10, 23, 23, 0))).toBe(3600000);
  expect(msUntilNextDay(Date.UTC(2026, 10, 23))).toBe(DAY_MS);
});
