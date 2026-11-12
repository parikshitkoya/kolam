import { describe, expect, test } from 'vitest';
import { OPS, at, layoutCells, loops, makeBoard, parseStart, type OpName } from '../../shared/kolam/core';
import { LAYOUTS, makeDaily, recipeBoard, signature, type Daily, type LayoutId } from './daily';
import { solve } from './solver';

const EXPECTED = [
  [1, 'sq3', 'mirror', 2, 5, 'eae53a1ac831c4cd', '000101011000'],
  [2, 'hour5', 'mirror2', 3, 9, 'a6cd959e6cb298a9', '01110010000010010110'],
  [3, 'col35', 'mirror', 3, 6, '6adc93981cbaf8f7', '0001000010111111010011'],
  [4, 'dia7', 'rot4', 3, 13, '1b9129a81a46100f', '010011100000001011000010000010110010'],
  [5, 'sq5', 'mirror2', 4, 9, 'ebfe6ea4ca8c35ef', '0111100110011100101001001100111100110110'],
  [6, 'hex5', 'mirror2', 5, 7, '8b2a7f9b05fcd326', '1110111111011110101000111111101111'],
  [7, 'lantern', 'mirror2', 5, 15, 'db1eed9d79026ec8', '00010110000101001010000100000100011010001100011000'],
  [8, 'dia5', 'rot2', 2, 5, '424a4a7a8df59775', '0111100000101110'],
  [9, 'rect34', 'mirror2', 2, 7, 'd27755f3a792d8d8', '01001000100100100'],
  [10, 'col35', 'mirror', 3, 6, '894697baa85e01d9', '1011010100010110001000'],
  [11, 'tee7', 'mirror2', 4, 9, '53f5ad414531c954', '1111010011100101001001100111001111'],
  [12, 'hex5', 'mirror2', 4, 7, '98164cea0897e79d', '1111101010001100101000101001010111'],
  [13, 'dia7', 'mirror2', 5, 9, '03dfdd02b286c835', '011111010100011001010001010010101110'],
  [14, 'rect74', 'mirror2', 4, 15, '539d8ce7c14cd66c', '001101001101010100001101001011010011110010010'],
] as const;

const runDays = (n: number): Daily[] => {
  const history = new Set<string>();
  let prevLayout: LayoutId | null = null;
  const out: Daily[] = [];
  for (let day = 1; day <= n; day++) {
    const d = makeDaily({ day, weekday: (day - 1) % 7, prevLayout, isUsed: (s) => history.has(s), salt: 'kolam-v1' });
    history.add(d.sig);
    prevLayout = d.layout;
    out.push(d);
  }
  return out;
};

test('first 14 days match the reference', () => {
  const days = runDays(14);
  EXPECTED.forEach(([day, layout, group, par, nloops, sig, start], i) => {
    const d = at(days, i);
    expect({ day: d.day, layout: d.layout, group: d.group, par: d.par, loops: d.loops, sig: d.sig, start: d.start }).toEqual({
      day, layout, group, par, loops: nloops, sig, start,
    });
    expect(d.strict).toBe(true);
  });
});

test('400 days: distinct sigs, no consecutive layout, par re-solves', () => {
  const days = runDays(400);
  expect(new Set(days.map((d) => d.sig)).size).toBe(400);
  for (let i = 1; i < days.length; i++) expect(at(days, i).layout).not.toBe(at(days, i - 1).layout);
  for (const d of days) {
    const { B, O } = recipeBoard(d.layout + ':' + d.group);
    expect(solve(B, O, parseStart(d.start), d.par)?.par).toBe(d.par);
  }
});

describe('signature', () => {
  test('is 16 hex chars and invariant under the 8 symmetries', () => {
    const B = makeBoard(layoutCells(LAYOUTS.sq5));
    const w = parseStart('0111100110011100101001001100111100110111');
    const base = signature(B, w);
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    const cx = 5, cy = 5;
    const ops: OpName[] = ['id', 'mv', 'mh', 'r180', 'r90', 'r270', 'd1', 'd2'];
    const seen = new Set<string>();
    for (const op of ops) {
      const m = new Uint8Array(B.gaps.length);
      B.gaps.forEach((g, gi) => {
        const [x, y] = OPS[op](g.mx - cx, g.my - cy);
        const j = B.gapAt.get(x + cx + ',' + (y + cy));
        if (j === undefined) throw new Error('unmapped gap');
        m[j] = at(w, gi);
      });
      seen.add(Array.from(m).join(''));
      expect(signature(B, m)).toBe(base);
    }
    // the test state is asymmetric, so the 8 images really differ
    expect(seen.size).toBeGreaterThan(1);
    expect(loops(B, w).count).toBeGreaterThan(0);
  });
});
