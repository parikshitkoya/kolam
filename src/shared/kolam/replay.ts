// Replay a tap list over a start state. Used by the server (completion) and the client (restore, logged-out).
import { loops, toggleOrbit, type Board, type Orbits } from './core';

export const replay = (
  B: Board,
  O: Orbits,
  start: Uint8Array,
  taps: readonly number[]
): { woven: Uint8Array; loops: number; trail: number[] } => {
  const woven = Uint8Array.from(start);
  const trail = [loops(B, woven).count];
  for (const o of taps) {
    if (!Number.isInteger(o) || o < 0 || o >= O.orbs.length) {
      throw new RangeError(`orbit ${o} out of range`);
    }
    toggleOrbit(woven, O, o);
    trail.push(loops(B, woven).count);
  }
  return { woven, loops: trail[trail.length - 1] ?? 0, trail };
};
