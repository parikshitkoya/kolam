import { describe, expect, test } from 'vitest';
import {
  GROUPS,
  OPS,
  isGroup,
  layoutCells,
  loops,
  makeBoard,
  orbits,
  parseStart,
  toggleOrbit,
  traceLoops,
  type Board,
  type Group,
} from './core';

const all = (B: Board) => new Uint8Array(B.gaps.length).fill(1);
const none = (B: Board) => new Uint8Array(B.gaps.length);

// Small deterministic generator so the random-state tests are repeatable.
const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

describe('loops', () => {
  test.each([
    [[3, 3, 3], 'all', 9, 12, 3],
    [[6, 6, 6, 6], 'all', 24, 38, 2],
    [[5, 5, 5, 5, 5], 'all', 25, 40, 5],
    [[4, 4, 4], 'all', 12, 17, 1],
    [[1, 3, 5, 3, 1], 'none', 13, 16, 13],
    [[1, 3, 5, 3, 1], 'all', 13, 16, 3],
    [[3, 5, 7, 7, 7, 5, 3], 'none', 37, 60, 37],
  ] as const)('loops %j %s', (rows, w, dots, gaps, count) => {
    const B = makeBoard(layoutCells(rows));
    expect(B.n).toBe(dots);
    expect(B.gaps.length).toBe(gaps);
    expect(loops(B, w === 'all' ? all(B) : none(B)).count).toBe(count);
  });
});

describe('orbits', () => {
  test.each([
    ['sq3', [3, 3, 3], 'rot4', 12, 3],
    ['sq3', [3, 3, 3], 'mirror', 12, 7],
    ['dia5', [1, 3, 5, 3, 1], 'mirror2', 16, 6],
    ['sq4', [4, 4, 4, 4], 'mirror', 24, 14],
    ['sq5', [5, 5, 5, 5, 5], 'mirror2', 40, 12],
    ['sq5', [5, 5, 5, 5, 5], 'rot4', 40, 10],
    ['oct7', [3, 5, 7, 7, 7, 5, 3], 'rot4', 60, 15],
    ['plus7', [3, 3, 7, 7, 7, 3, 3], 'mirror2', 52, 16],
  ] as const)('orbits %s:%s', (_name, rows, group, gaps, count) => {
    const B = makeBoard(layoutCells(rows));
    expect(B.gaps.length).toBe(gaps);
    expect(orbits(B, group).orbs.length).toBe(count);
  });

  test('rot4 on 5x3 throws', () => {
    expect(() => orbits(makeBoard(layoutCells([5, 5, 5])), 'rot4')).toThrow(
      'layout is not symmetric under rot4'
    );
  });
});

const SIX: (readonly number[])[] = [
  [3, 3, 3],
  [1, 3, 5, 3, 1],
  [5, 5, 5, 5, 5],
  [3, 5, 7, 5, 3],
  [3, 3, 7, 7, 7, 3, 3],
  [4, 4, 4],
];

test('trace matches loops on 200 random states over 6 layouts', () => {
  const R = lcg(42);
  for (const rows of SIX) {
    const B = makeBoard(layoutCells(rows));
    for (let t = 0; t < 200; t++) {
      const w = new Uint8Array(B.gaps.length);
      for (let i = 0; i < w.length; i++) w[i] = R() < 0.5 ? 1 : 0;
      const traces = traceLoops(B, w, 100);
      expect(traces.length).toBe(loops(B, w).count);
      const seen = new Uint8Array(B.n * 4);
      for (const tr of traces) {
        expect(tr.path.endsWith('Z')).toBe(true);
        for (const s of tr.segs) seen[s] = (seen[s] ?? 0) + 1;
      }
      expect(Array.from(seen).every((v) => v === 1)).toBe(true);
    }
  }
});

const RECIPES: [readonly number[], Group][] = [
  [[3, 3, 3], 'mirror'],
  [[3, 3, 3], 'rot2'],
  [[3, 3, 3], 'rot4'],
  [[1, 3, 5, 3, 1], 'mirror2'],
  [[5, 5, 5, 5, 5], 'rot4'],
  [[3, 3, 7, 7, 7, 3, 3], 'mirror2'],
];

test('every orbit of every group is a symmetric set', () => {
  for (const [rows, group] of RECIPES) {
    const B = makeBoard(layoutCells(rows));
    const O = orbits(B, group);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of B.cells) {
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    const cx = minx + maxx + 1, cy = miny + maxy + 1;
    O.orbs.forEach((orb, oi) => {
      for (const gi of orb) {
        expect(O.of[gi]).toBe(oi);
        const g = B.gaps[gi];
        if (!g) throw new Error('missing gap');
        for (const op of GROUPS[group]) {
          const [x, y] = OPS[op](g.mx - cx, g.my - cy);
          const j = B.gapAt.get(x + cx + ',' + (y + cy));
          expect(j !== undefined && orb.includes(j)).toBe(true);
        }
      }
      const w = new Uint8Array(B.gaps.length);
      w[0] = 1;
      const before = Array.from(w);
      toggleOrbit(w, O, oi);
      for (const gi of orb) expect(w[gi]).toBe(before[gi] === 1 ? 0 : 1);
      toggleOrbit(w, O, oi);
      expect(Array.from(w)).toEqual(before);
    });
  }
});

test('parseStart and isGroup', () => {
  expect(Array.from(parseStart('0101'))).toEqual([0, 1, 0, 1]);
  expect(isGroup('rot4')).toBe(true);
  expect(isGroup('rot3')).toBe(false);
  expect(isGroup(4)).toBe(false);
});
