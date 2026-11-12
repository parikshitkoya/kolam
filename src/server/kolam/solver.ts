// Solver (server only). Port of build spec §4.1 solve and monotone.
import { at, loops, type Board, type Orbits } from '../../shared/kolam/core';

// Fewest orbit taps that reach one loop, by iterative deepening up to maxD.
// Returns {par, sol: [orbit indices], nsol: number of distinct shortest solutions} or null.
export const solve = (
  B: Board,
  O: Orbits,
  start: ArrayLike<number>,
  maxD: number
): { par: number; sol: number[]; nsol: number } | null => {
  const w = Uint8Array.from(start);
  const n = O.orbs.length;
  const tog = (o: number) => {
    for (const g of at(O.orbs, o)) w[g] = at(w, g) ^ 1;
  };
  for (let d = 0; d <= Math.min(maxD, n); d++) {
    let best: number[] | null = null;
    let count = 0;
    const pick: number[] = [];
    const rec = (from: number, left: number) => {
      if (left === 0) {
        if (loops(B, w).count === 1) {
          count++;
          if (!best) best = pick.slice();
        }
        return;
      }
      for (let o = from; o <= n - left; o++) {
        tog(o);
        pick.push(o);
        rec(o + 1, left - 1);
        pick.pop();
        tog(o);
      }
    };
    rec(0, d);
    if (best) return { par: d, sol: best, nsol: count };
  }
  return null;
};

// True if one loop can be reached using only taps that each strictly reduce the loop count.
// Orbit counts stay <= 16 for every approved recipe, so a 32-bit mask is safe.
export const monotone = (B: Board, O: Orbits, start: ArrayLike<number>): boolean => {
  const w = Uint8Array.from(start);
  const memo = new Map<number, boolean>();
  const rec = (mask: number, k: number): boolean => {
    if (k === 1) return true;
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    let ok = false;
    for (let o = 0; o < O.orbs.length && !ok; o++) {
      const orb = at(O.orbs, o);
      for (const g of orb) w[g] = at(w, g) ^ 1;
      const c = loops(B, w).count;
      if (c < k) ok = rec(mask ^ (1 << o), c);
      for (const g of orb) w[g] = at(w, g) ^ 1;
    }
    memo.set(mask, ok);
    return ok;
  };
  return rec(0, loops(B, w).count);
};
