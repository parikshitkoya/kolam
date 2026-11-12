import { expect, test } from 'vitest';
import { layoutCells, makeBoard, orbits, parseStart } from './core';
import { replay } from './replay';

// Day 1 reference puzzle: sq3:mirror, par 2, 5 loops.
const B = makeBoard(layoutCells([3, 3, 3]));
const O = orbits(B, 'mirror');
const start = parseStart('000101011000');

test('no taps gives the start loop count', () => {
  const r = replay(B, O, start, []);
  expect(r.trail).toEqual([5]);
  expect(r.loops).toBe(5);
  expect(Array.from(r.woven)).toEqual(Array.from(start));
});

test('a two-tap solution ends at one loop with a full trail', () => {
  // Shared code cannot import the server solver; search the par-2 pairs directly.
  let found: number[] | null = null;
  for (let a = 0; a < O.orbs.length && !found; a++)
    for (let b = a + 1; b < O.orbs.length && !found; b++)
      if (replay(B, O, start, [a, b]).loops === 1) found = [a, b];
  expect(found).not.toBeNull();
  const r = replay(B, O, start, found ?? []);
  expect(r.trail.length).toBe(3);
  expect(r.trail[0]).toBe(5);
  expect(r.trail[2]).toBe(1);
});

test('tapping the same orbit twice restores the start', () => {
  const r = replay(B, O, start, [3, 3]);
  expect(Array.from(r.woven)).toEqual(Array.from(start));
  expect(r.trail[2]).toBe(5);
});

test('does not mutate the start array', () => {
  const copy = Array.from(start);
  replay(B, O, start, [0, 1, 2]);
  expect(Array.from(start)).toEqual(copy);
});

test('out-of-range orbit throws RangeError', () => {
  expect(() => replay(B, O, start, [O.orbs.length])).toThrow(RangeError);
  expect(() => replay(B, O, start, [-1])).toThrow(RangeError);
  expect(() => replay(B, O, start, [1.5])).toThrow(RangeError);
});
