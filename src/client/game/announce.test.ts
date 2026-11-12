import { expect, test } from 'vitest';
import { announceText } from './announce';

test('announceText', () => {
  expect(announceText(5, false)).toBe('5 loops');
  expect(announceText(1, true)).toBe('1 loop. Solved.');
  expect(announceText(1, false)).toBe('1 loop');
});
