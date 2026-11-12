// Stable loop colouring (prototype paint(), build spec §7.3): loops keep their powder colour from one
// tap to the next where they can, and two loops that meet at a gap never share a colour.
import { at, type Board, type Trace } from './core';

export const POWDER: readonly string[] = [
  '#f2c14e',
  '#8fd36b',
  '#7cc4f0',
  '#f59ac0',
  '#5fd6c3',
  '#c6a8f7',
  '#f79a4d',
];

export const assignColours = (
  B: Board,
  traces: Trace[],
  prevSegColour: Int8Array | null
): { colours: number[]; segColour: Int8Array } => {
  const lab = new Int32Array(B.n * 4);
  traces.forEach((l, i) => {
    for (const s of l.segs) lab[s] = i;
  });
  const adj = traces.map(() => new Set<number>());
  for (const g of B.gaps) {
    const ls = [
      at(lab, g.a * 4 + g.sa),
      at(lab, g.a * 4 + ((g.sa + 3) % 4)),
      at(lab, g.b * 4 + g.sb),
      at(lab, g.b * 4 + ((g.sb + 3) % 4)),
    ];
    for (const a of ls) for (const b of ls) if (a !== b) at(adj, a).add(b);
  }
  const order = traces
    .map((_, i) => i)
    .sort((a, b) => at(traces, b).segs.length - at(traces, a).segs.length);
  const col = new Array<number>(traces.length).fill(-1);
  const used = new Array<number>(POWDER.length).fill(0);
  const bannedFor = (i: number) => {
    const banned = new Set<number>();
    for (const j of at(adj, i)) if (at(col, j) >= 0) banned.add(at(col, j));
    return banned;
  };
  // Phase 1: a loop whose segments all carried one colour before (unchanged, or a piece of a split)
  // keeps that colour if no neighbour already has it. Without this, a split-off piece that is banned
  // from its old colour could take the colour of an untouched loop processed later.
  if (prevSegColour) {
    for (const i of order) {
      const segs = at(traces, i).segs;
      const c0 = prevSegColour[at(segs, 0)];
      if (c0 === undefined || c0 < 0 || !segs.every((s) => prevSegColour[s] === c0)) continue;
      if (bannedFor(i).has(c0)) continue;
      col[i] = c0;
      used[c0] = at(used, c0) + 1;
    }
  }
  // Phase 2: the prototype's greedy pass for everything else, longest first.
  for (const i of order) {
    if (at(col, i) >= 0) continue;
    const tally = new Array<number>(POWDER.length).fill(0);
    if (prevSegColour) {
      for (const s of at(traces, i).segs) {
        const c = prevSegColour[s];
        if (c !== undefined && c >= 0) tally[c] = at(tally, c) + 1;
      }
    }
    const banned = bannedFor(i);
    const pref = POWDER.map((_, c) => c).sort(
      (a, b) => at(tally, b) - at(tally, a) || at(used, a) - at(used, b) || a - b
    );
    const pick = pref.find((c) => !banned.has(c)) ?? at(pref, 0);
    col[i] = pick;
    used[pick] = at(used, pick) + 1;
  }
  const segColour = new Int8Array(B.n * 4).fill(-1);
  traces.forEach((l, i) => {
    for (const s of l.segs) segColour[s] = at(col, i);
  });
  return { colours: col, segColour };
};
