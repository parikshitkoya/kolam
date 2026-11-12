// Daily puzzle generator (server only). Port of build spec §4.2; RNG call order is load-bearing.
import {
  OPS,
  at,
  isGroup,
  layoutCells,
  loops,
  makeBoard,
  orbits,
  type Board,
  type Group,
  type OpName,
  type Orbits,
} from '../../shared/kolam/core';
import { monotone, solve } from './solver';

export const rng = (seed: number): (() => number) => {
  // mulberry32
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const fnv = (str: string, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// id -> dots per row (rows are centred)
export const LAYOUTS = {
  sq3: [3, 3, 3],
  plus5: [1, 1, 5, 1, 1],
  rect34: [3, 3, 3, 3],
  rect43: [4, 4, 4],
  dia5: [1, 3, 5, 3, 1],
  bar53: [5, 5, 5],
  col35: [3, 3, 3, 3, 3],
  sq4: [4, 4, 4, 4],
  hour5: [5, 3, 1, 3, 5],
  step7: [1, 3, 3, 5, 3, 3, 1],
  rect54: [5, 5, 5, 5],
  oct5: [3, 5, 5, 5, 3],
  bar73: [7, 7, 7],
  hex5: [3, 5, 7, 5, 3],
  tee7: [1, 3, 5, 5, 5, 3, 1],
  sq5: [5, 5, 5, 5, 5],
  dia7: [1, 3, 5, 7, 5, 3, 1],
  rect74: [7, 7, 7, 7],
  rect56: [5, 5, 5, 5, 5, 5],
  lantern: [3, 5, 5, 5, 5, 5, 3],
  plus7: [3, 3, 7, 7, 7, 3, 3],
  oct7: [3, 5, 7, 7, 7, 5, 3],
} satisfies Record<string, number[]>;

export type LayoutId = keyof typeof LAYOUTS;

export const isLayoutId = (x: string): x is LayoutId =>
  Object.prototype.hasOwnProperty.call(LAYOUTS, x);

export type Tier = {
  name: string;
  par: [number, number];
  maxSol: number;
  mono: boolean | null;
  recipes: string[];
};

// One tier per weekday, Monday first. recipes are "layout:group". par = [min, max].
// mono: true = solvable by loop-reducing taps only; false = needs a sideways tap; null = either.
export const TIERS: Tier[] = [
  {
    name: 'Mon', par: [2, 2], maxSol: 99, mono: true,
    recipes: ['sq3:mirror', 'sq3:rot2', 'plus5:mirror', 'rect34:mirror', 'rect43:mirror', 'dia5:mirror', 'dia5:rot2', 'rect34:rot2', 'rect43:rot2'],
  },
  {
    name: 'Tue', par: [2, 3], maxSol: 99, mono: true,
    recipes: ['dia5:mirror2', 'dia5:rot4', 'bar53:mirror2', 'col35:mirror2', 'rect34:mirror2', 'rect43:mirror2', 'hour5:mirror2', 'bar53:mirror', 'bar53:rot2', 'col35:rot2'],
  },
  {
    name: 'Wed', par: [3, 3], maxSol: 99, mono: true,
    recipes: ['rect54:mirror2', 'oct5:rot4', 'oct5:mirror2', 'hour5:mirror2', 'step7:mirror2', 'bar73:mirror2', 'col35:mirror', 'hour5:rot2', 'dia5:mirror2'],
  },
  {
    name: 'Thu', par: [3, 4], maxSol: 6, mono: null,
    recipes: ['oct5:rot4', 'oct5:mirror2', 'hex5:mirror2', 'sq5:rot4', 'tee7:mirror2', 'step7:mirror2', 'dia7:rot4', 'sq4:mirror', 'bar73:mirror2'],
  },
  {
    name: 'Fri', par: [4, 4], maxSol: 12, mono: false,
    recipes: ['sq5:mirror2', 'sq5:rot4', 'hex5:mirror2', 'dia7:mirror2', 'dia7:rot4', 'tee7:mirror2', 'oct5:mirror2', 'step7:mirror2', 'sq4:mirror'],
  },
  {
    name: 'Sat', par: [5, 5], maxSol: 4, mono: false,
    recipes: ['dia7:mirror2', 'sq5:mirror2', 'hex5:mirror2', 'lantern:mirror2', 'plus7:mirror2', 'plus7:rot4', 'tee7:mirror2', 'step7:mirror2', 'oct5:mirror2'],
  },
  {
    name: 'Sun', par: [4, 5], maxSol: 20, mono: null,
    recipes: ['oct7:rot4', 'plus7:rot4', 'plus7:mirror2', 'lantern:mirror2', 'rect56:mirror2', 'rect74:mirror2'],
  },
];

type RecipeBoard = { layout: LayoutId; group: Group; B: Board; O: Orbits };
const boardCache = new Map<string, RecipeBoard>();

export const recipeBoard = (recipe: string): RecipeBoard => {
  let rb = boardCache.get(recipe);
  if (!rb) {
    const [layout, group] = recipe.split(':');
    if (layout === undefined || !isLayoutId(layout) || !isGroup(group)) {
      throw new Error('bad recipe ' + recipe);
    }
    const B = makeBoard(layoutCells(LAYOUTS[layout]));
    rb = { layout, group, B, O: orbits(B, group) };
    boardCache.set(recipe, rb);
  }
  return rb;
};

// Same order as Object.keys(OPS) in the reference.
const ALL_OPS: OpName[] = ['id', 'mv', 'mh', 'r180', 'r90', 'r270', 'd1', 'd2'];

// Identity of a start pattern, the same for all 8 rotations and reflections of the picture.
export const signature = (B: Board, woven: ArrayLike<number>): string => {
  const cells = B.cells.map(([x, y]): [number, number] => [2 * x + 1, 2 * y + 1]);
  const gaps = B.gaps
    .filter((_, gi) => woven[gi])
    .map((g): [number, number] => [g.mx, g.my]);
  let best = '';
  let first = true;
  for (const name of ALL_OPS) {
    const op = OPS[name];
    const c = cells.map((p) => op(p[0], p[1]));
    const g = gaps.map((p) => op(p[0], p[1]));
    const minx = Math.min(...c.map((p) => p[0]));
    const miny = Math.min(...c.map((p) => p[1]));
    const norm = (pts: [number, number][]) =>
      pts
        .map((p) => p[0] - minx + ',' + (p[1] - miny))
        .sort()
        .join(';');
    const s = 'C' + norm(c) + '|G' + norm(g);
    if (first || s < best) {
      best = s;
      first = false;
    }
  }
  return (
    fnv(best, 2166136261).toString(16).padStart(8, '0') +
    fnv(best, 0x9747b28c).toString(16).padStart(8, '0')
  );
};

export type Daily = {
  day: number;
  layout: LayoutId;
  group: Group;
  start: string;
  par: number;
  nsol: number;
  mono: boolean;
  loops: number;
  sig: string;
  strict: boolean;
};

// day: integer day number (1 = launch day). weekday: 0 = Monday ... 6 = Sunday (UTC).
// prevLayout: layout id used on day-1, or null. isUsed(sig): true if that signature was ever issued.
export const makeDaily = (o: {
  day: number;
  weekday: number;
  prevLayout: LayoutId | null;
  isUsed: (sig: string) => boolean;
  salt?: string;
}): Daily => {
  const { day, weekday, prevLayout, isUsed } = o;
  const salt = o.salt ?? 'kolam-v1';
  const tier = at(TIERS, weekday);
  const R = rng(fnv(salt + ':' + day, 2166136261));
  const recipes = tier.recipes.filter((r) => r.split(':')[0] !== prevLayout);
  for (let i = recipes.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    const tmp = at(recipes, i);
    recipes[i] = at(recipes, j);
    recipes[j] = tmp;
  }
  // Pass 0: full tier rules. Pass 1: drop the maxSol and mono rules. Pass 2: any unused puzzle with par >= 2.
  for (let pass = 0; pass < 3; pass++) {
    const lo = pass < 2 ? tier.par[0] : 2;
    const hi = pass < 2 ? tier.par[1] : Math.max(tier.par[1], 5);
    for (let round = 0; round < 6; round++) {
      for (const recipe of recipes) {
        const { layout, group, B, O } = recipeBoard(recipe);
        for (let t = 0; t < 12; t++) {
          const w = new Uint8Array(B.gaps.length);
          O.orbs.forEach((orb) => {
            if (R() < 0.5) for (const g of orb) w[g] = 1;
          });
          const k = loops(B, w).count;
          if (k < lo + 2) continue;
          const r = solve(B, O, w, hi);
          if (!r || r.par < lo) continue;
          const mono = monotone(B, O, w);
          if (pass === 0 && (r.nsol > tier.maxSol || (tier.mono !== null && mono !== tier.mono))) {
            continue;
          }
          const sig = signature(B, w);
          if (isUsed(sig)) continue;
          return {
            day,
            layout,
            group,
            start: Array.from(w).join(''),
            par: r.par,
            nsol: r.nsol,
            mono,
            loops: k,
            sig,
            strict: pass === 0,
          };
        }
      }
    }
  }
  throw new Error('no unused puzzle found for day ' + day);
};
