import { expect, test } from 'vitest';
import { POWDER } from './colours';
import { DASHES } from './patterns';

test('one distinct dash pattern per powder colour, the first solid', () => {
  expect(DASHES.length).toBe(POWDER.length);
  expect(new Set(DASHES).size).toBe(DASHES.length);
  expect(DASHES[0]).toBe('none');
});
