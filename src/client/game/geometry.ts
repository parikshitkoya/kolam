// Board geometry shared by the game board and the splash still board.
import type { Board } from '../../shared/kolam/core';

export const U = 100;
export const PAD = 62;

export const boardBox = (B: Board) => {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const [x, y] of B.cells) {
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    miny = Math.min(miny, y);
    maxy = Math.max(maxy, y);
  }
  const W = (maxx - minx + 1) * U;
  const H = (maxy - miny + 1) * U;
  return {
    minx,
    miny,
    W,
    H,
    viewBox: [minx * U - PAD, miny * U - PAD, W + 2 * PAD, H + 2 * PAD].join(' '),
  };
};
