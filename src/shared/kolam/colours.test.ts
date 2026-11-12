import { expect, test } from 'vitest';
import { at, layoutCells, makeBoard, orbits, parseStart, toggleOrbit, traceLoops, type Board, type Trace } from './core';
import { POWDER, assignColours } from './colours';

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// Adjacency as in the prototype: loops whose segments meet at a gap.
const adjacency = (B: Board, tr: Trace[]) => {
  const lab = new Int32Array(B.n * 4);
  tr.forEach((l, i) => {
    for (const s of l.segs) lab[s] = i;
  });
  const pairs: [number, number][] = [];
  for (const g of B.gaps) {
    const ls = [
      at(lab, g.a * 4 + g.sa),
      at(lab, g.a * 4 + ((g.sa + 3) % 4)),
      at(lab, g.b * 4 + g.sb),
      at(lab, g.b * 4 + ((g.sb + 3) % 4)),
    ];
    for (const a of ls) for (const b of ls) if (a !== b) pairs.push([a, b]);
  }
  return pairs;
};

test('POWDER palette', () => {
  expect(POWDER).toEqual(['#f2c14e', '#8fd36b', '#7cc4f0', '#f59ac0', '#5fd6c3', '#c6a8f7', '#f79a4d']);
});

test('adjacent loops never share a colour over 100 random sq5 states', () => {
  const B = makeBoard(layoutCells([5, 5, 5, 5, 5]));
  const R = lcg(7);
  let prev: Int8Array | null = null;
  for (let t = 0; t < 100; t++) {
    const w = new Uint8Array(B.gaps.length);
    for (let i = 0; i < w.length; i++) w[i] = R() < 0.5 ? 1 : 0;
    const tr = traceLoops(B, w, 100);
    const { colours, segColour } = assignColours(B, tr, prev);
    expect(colours.length).toBe(tr.length);
    for (const [a, b] of adjacency(B, tr)) expect(colours[a]).not.toBe(colours[b]);
    tr.forEach((l, i) => {
      for (const s of l.segs) expect(segColour[s]).toBe(colours[i]);
    });
    prev = segColour;
  }
});

test('a loop untouched by a tap keeps its colour', () => {
  const B = makeBoard(layoutCells([3, 3, 3]));
  const O = orbits(B, 'mirror');
  const start = parseStart('000101011000');
  const tr0 = traceLoops(B, start, 100);
  const first = assignColours(B, tr0, null);
  let checked = 0;
  for (let o = 0; o < O.orbs.length; o++) {
    const w = Uint8Array.from(start);
    toggleOrbit(w, O, o);
    const tr1 = traceLoops(B, w, 100);
    const next = assignColours(B, tr1, first.segColour);
    tr1.forEach((l, i) => {
      const key = [...l.segs].sort((a, b) => a - b).join(',');
      const j = tr0.findIndex((m) => [...m.segs].sort((a, b) => a - b).join(',') === key);
      if (j >= 0) {
        checked++;
        expect(next.colours[i]).toBe(first.colours[j]);
      }
    });
  }
  expect(checked).toBeGreaterThan(0);
});
