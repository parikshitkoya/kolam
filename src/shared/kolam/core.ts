// Kolam core model (pure, no platform APIs). Port of build spec §4.1.
// Cells hold one dot each. Sides of a cell: 0=N, 1=E, 2=S, 3=W (screen coords, y down).
// Segment k of a cell joins the midpoints of side k and side k+1 (four segments = a ring round the dot).
// A gap is the shared edge between two neighbouring cells. woven[gap] = 1 means the lines cross there.

export type Cell = readonly [number, number];
export type Gap = { a: number; sa: number; b: number; sb: number; mx: number; my: number };
export type Board = {
  cells: Cell[];
  gaps: Gap[];
  gapAt: Map<string, number>;
  port: Int32Array;
  n: number;
};
export type Group = 'mirror' | 'rot2' | 'mirror2' | 'rot4';
export type OpName = 'id' | 'mv' | 'mh' | 'r180' | 'r90' | 'r270' | 'd1' | 'd2';
export type Orbits = { orbs: number[][]; of: Int32Array };
export type Trace = { segs: number[]; path: string };

/** Indexed read that throws instead of returning undefined. */
export const at = <T>(arr: ArrayLike<T>, i: number): T => {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range`);
  return v;
};

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;

// rows: dots per row, each row centred, e.g. [1,3,5,3,1] is a diamond.
export const layoutCells = (rows: readonly number[]): Cell[] => {
  const W = Math.max(...rows);
  const cells: Cell[] = [];
  rows.forEach((n, y) => {
    const off = (W - n) / 2;
    for (let i = 0; i < n; i++) cells.push([off + i, y]);
  });
  return cells;
};

export const makeBoard = (cellsIn: readonly Cell[]): Board => {
  const cells = cellsIn.slice();
  const key = (x: number, y: number) => x + ',' + y;
  const idx = new Map<string, number>();
  cells.forEach((c, i) => idx.set(key(c[0], c[1]), i));
  const gaps: Gap[] = [];
  const gapAt = new Map<string, number>(); // (mx,my) = midpoint in doubled coords
  cells.forEach((c, i) => {
    for (const s of [1, 2]) {
      // look E and S only, so each gap is listed once
      const j = idx.get(key(c[0] + at(DX, s), c[1] + at(DY, s)));
      if (j !== undefined) {
        const mx = 2 * c[0] + 1 + at(DX, s);
        const my = 2 * c[1] + 1 + at(DY, s);
        gapAt.set(mx + ',' + my, gaps.length);
        gaps.push({ a: i, sa: s, b: j, sb: (s + 2) % 4, mx, my });
      }
    }
  });
  const port = new Int32Array(cells.length * 4).fill(-1); // (cell, side) -> gap index, -1 = outer edge
  gaps.forEach((g, gi) => {
    port[g.a * 4 + g.sa] = gi;
    port[g.b * 4 + g.sb] = gi;
  });
  return { cells, gaps, gapAt, port, n: cells.length };
};

// Count loops with union-find. Returns {count, lab} where lab[segment] = loop index.
export const loops = (B: Board, woven: ArrayLike<number>): { count: number; lab: Int32Array } => {
  const N = B.n * 4;
  const par = new Int32Array(N);
  for (let i = 0; i < N; i++) par[i] = i;
  const find = (i: number) => {
    while (at(par, i) !== i) {
      par[i] = at(par, at(par, i));
      i = at(par, i);
    }
    return i;
  };
  const uni = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a !== b) par[a] = b;
  };
  for (let c = 0; c < B.n; c++)
    for (let s = 0; s < 4; s++) {
      const gi = at(B.port, c * 4 + s);
      if (gi < 0 || !woven[gi]) uni(c * 4 + s, c * 4 + ((s + 3) % 4)); // line turns back round its own dot
    }
  B.gaps.forEach((g, gi) => {
    if (woven[gi]) {
      // lines go straight through into the neighbouring cell
      uni(g.a * 4 + g.sa, g.b * 4 + g.sb);
      uni(g.a * 4 + ((g.sa + 3) % 4), g.b * 4 + ((g.sb + 3) % 4));
    }
  });
  const lab = new Int32Array(N);
  const m = new Map<number, number>();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const r = find(i);
    let l = m.get(r);
    if (l === undefined) {
      l = k++;
      m.set(r, l);
    }
    lab[i] = l;
  }
  return { count: k, lab };
};

// Symmetry groups, as point maps on doubled coordinates about the board centre.
export const OPS: Record<OpName, (x: number, y: number) => [number, number]> = {
  id: (x, y) => [x, y],
  mv: (x, y) => [-x, y],
  mh: (x, y) => [x, -y],
  r180: (x, y) => [-x, -y],
  r90: (x, y) => [-y, x],
  r270: (x, y) => [y, -x],
  d1: (x, y) => [y, x],
  d2: (x, y) => [-y, -x],
};

export const GROUPS: Record<Group, OpName[]> = {
  mirror: ['id', 'mv'], // one mirror (left-right): a tap repeats in 2 places
  rot2: ['id', 'r180'], // half turn: 2 places
  mirror2: ['id', 'mv', 'mh', 'r180'], // two mirrors: 4 places
  rot4: ['id', 'r90', 'r180', 'r270'], // quarter turns: 4 places
};

export const isGroup = (x: unknown): x is Group =>
  x === 'mirror' || x === 'rot2' || x === 'mirror2' || x === 'rot4';

// Partition gaps into orbits: the sets of gaps that toggle together. Throws if the layout lacks the symmetry.
export const orbits = (B: Board, group: Group): Orbits => {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const [x, y] of B.cells) {
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    miny = Math.min(miny, y);
    maxy = Math.max(maxy, y);
  }
  const cx = minx + maxx + 1, cy = miny + maxy + 1; // doubled centre
  const of = new Int32Array(B.gaps.length).fill(-1);
  const orbs: number[][] = [];
  B.gaps.forEach((g, gi) => {
    if (at(of, gi) >= 0) return;
    const set = new Set<number>();
    for (const o of GROUPS[group]) {
      const [x, y] = OPS[o](g.mx - cx, g.my - cy);
      const j = B.gapAt.get(x + cx + ',' + (y + cy));
      if (j === undefined) throw new Error('layout is not symmetric under ' + group);
      set.add(j);
    }
    for (const j of set) of[j] = orbs.length;
    orbs.push([...set].sort((a, b) => a - b));
  });
  return { orbs, of };
};

// Trace every loop as an ordered run of segments plus an SVG path. U = cell size in user units.
// Turns are drawn as quadratic curves through the gap midpoint; crossings are straight lines.
export const traceLoops = (B: Board, woven: ArrayLike<number>, U: number): Trace[] => {
  const N = B.n * 4;
  const seen = new Uint8Array(N);
  const out: Trace[] = [];
  const f = (p: readonly [number, number]) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
  const mid = (c: number, s: number): [number, number] => {
    const cell = at(B.cells, c);
    const x = cell[0], y = cell[1];
    return [
      (x + (s === 1 ? 1 : s === 3 ? 0 : 0.5)) * U,
      (y + (s === 2 ? 1 : s === 0 ? 0 : 0.5)) * U,
    ];
  };
  const ctr = (c: number, k: number): [number, number] => {
    const a = mid(c, k), b = mid(c, (k + 1) % 4);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0]) continue;
    let c = s0 >> 2, k = s0 & 3, d = 1;
    const segs: number[] = [];
    let path = 'M' + f(ctr(c, k));
    do {
      seen[c * 4 + k] = 1;
      segs.push(c * 4 + k);
      const s = d > 0 ? (k + 1) % 4 : k;
      const V = mid(c, s);
      const gi = at(B.port, c * 4 + s);
      if (gi < 0 || !woven[gi]) {
        k = d > 0 ? s : (k + 3) % 4;
        path += 'Q' + f(V) + ' ' + f(ctr(c, k));
      } else {
        const g = at(B.gaps, gi);
        const s2 = (s + 2) % 4;
        c = g.a === c ? g.b : g.a;
        if (d > 0) {
          k = (s2 + 3) % 4;
          d = -1;
        } else {
          k = s2;
          d = 1;
        }
        path += 'L' + f(ctr(c, k));
      }
    } while (c * 4 + k !== s0);
    out.push({ segs, path: path + 'Z' });
  }
  return out;
};

/** One char per gap, '1' = woven. */
export const parseStart = (start: string): Uint8Array => {
  const w = new Uint8Array(start.length);
  for (let i = 0; i < start.length; i++) w[i] = start[i] === '1' ? 1 : 0;
  return w;
};

/** Flip every gap of one orbit (mutates woven). */
export const toggleOrbit = (woven: Uint8Array, O: Orbits, orbit: number): void => {
  for (const g of at(O.orbs, orbit)) woven[g] = at(woven, g) ^ 1;
};
