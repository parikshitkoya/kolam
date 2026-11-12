import { expect, test } from 'vitest';
import { loops, parseStart } from '../../shared/kolam/core';
import { recipeBoard } from './daily';
import { monotone, solve } from './solver';

const DAY1 = { recipe: 'sq3:mirror', start: '000101011000' };
const DAY5 = { recipe: 'sq5:mirror2', start: '0111100110011100101001001100111100110110' };

test('solve finds par 2 on day 1', () => {
  const { B, O } = recipeBoard(DAY1.recipe);
  const r = solve(B, O, parseStart(DAY1.start), 5);
  expect(r?.par).toBe(2);
  expect(r?.sol.length).toBe(2);
});

test('solve on a one-loop state returns par 0', () => {
  const { B, O } = recipeBoard('rect43:mirror');
  const w = new Uint8Array(B.gaps.length).fill(1); // 4x3 all woven = gcd(4,3) = 1 loop
  expect(loops(B, w).count).toBe(1);
  expect(solve(B, O, w, 3)).toEqual({ par: 0, sol: [], nsol: 1 });
});

test('monotone: day 5 (Fri) needs a sideways tap, day 1 does not', () => {
  const d5 = recipeBoard(DAY5.recipe);
  expect(monotone(d5.B, d5.O, parseStart(DAY5.start))).toBe(false);
  const d1 = recipeBoard(DAY1.recipe);
  expect(monotone(d1.B, d1.O, parseStart(DAY1.start))).toBe(true);
});
