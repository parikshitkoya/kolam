import { expect, test } from 'vitest';
import { formatCountdown } from './countdown';

test('formatCountdown', () => {
  expect(formatCountdown(5 * 3600e3 + 12 * 60e3)).toBe('New puzzle in 5h 12m');
  expect(formatCountdown(12 * 60e3 + 5e3)).toBe('New puzzle in 12m');
  expect(formatCountdown(30e3)).toBe('New puzzle in under a minute');
  expect(formatCountdown(3600e3)).toBe('New puzzle in 1h 0m');
});
