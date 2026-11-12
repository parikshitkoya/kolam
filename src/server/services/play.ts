// Play: /api/state and /api/tap behaviour (design §3.3). Completion is decided by replaying taps.
import {
  isInt,
  isRecord,
  type Progress,
  type Result,
  type Stats,
  type StateResponse,
  type Streak,
  type TapResponse,
} from '../../shared/api';
import { dayNumber } from '../../shared/day';
import { parseStart } from '../../shared/kolam/core';
import { replay } from '../../shared/kolam/replay';
import { LAYOUTS, recipeBoard } from '../kolam/daily';
import { solve } from '../kolam/solver';
import { reddit } from '@devvit/web/server';
import {
  getCommented,
  getDayForPost,
  getProgress,
  getPuzzle,
  getStats,
  getStreak,
  incrStats,
  isSubscribed,
  setStreak,
  updateProgress,
  type PuzzleRecord,
} from '../store';

/** Build spec §6.2. Call only when the completion happens on the puzzle's own UTC day. */
export const nextStreak = (prev: Streak | null, day: number): Streak => {
  if (prev && prev.lastDay === day) return prev;
  const current = prev && prev.lastDay === day - 1 ? prev.current + 1 : 1;
  return { current, best: Math.max(prev?.best ?? 0, current), lastDay: day };
};

export const overBucket = (taps: number, par: number): number => Math.min(5, Math.max(0, taps - par));

const puzzleForPost = async (postId: string): Promise<PuzzleRecord | null> => {
  const day = await getDayForPost(postId);
  if (day === null) return null;
  return getPuzzle(day);
};

/** The result card payload; used by getState (reload) and applyTap (first completion). */
export const buildResult = (
  progress: Progress,
  puzzle: PuzzleRecord,
  streak: Streak | null,
  stats: Stats
): Result => {
  const { B, O } = recipeBoard(`${puzzle.layout}:${puzzle.group}`);
  return {
    trail: replay(B, O, parseStart(puzzle.start), progress.taps).trail,
    taps: progress.taps.length,
    par: puzzle.par,
    hints: progress.hints,
    streak,
    stats,
  };
};

export const getState = async (
  postId: string,
  userId: string | undefined,
  _now: number
): Promise<StateResponse | null> => {
  const p = await puzzleForPost(postId);
  if (!p) return null;
  const progress = userId ? await getProgress(p.day, userId) : null;
  const streak = userId ? await getStreak(userId) : null;
  const state: StateResponse = {
    status: 'ok',
    day: p.day,
    date: p.date,
    puzzle: { rows: LAYOUTS[p.layout], group: p.group, start: p.start },
    par: p.par,
    loggedIn: Boolean(userId),
    progress,
    streak,
    subscribed: userId ? await isSubscribed(userId) : false,
    commented: userId ? (await getCommented(p.day, userId)) !== null : false,
    username: userId ? ((await reddit.getCurrentUsername()) ?? null) : null,
  };
  if (progress?.done) {
    const stats = await getStats(p.day);
    state.stats = stats;
    try {
      state.result = buildResult(progress, p, streak, stats);
    } catch {
      // stored taps invalid: no result card
    }
  }
  return state;
};

export type TapOutcome =
  | { kind: 'ok'; body: TapResponse }
  | { kind: 'conflict'; taps: number[] }
  | { kind: 'done' }
  | { kind: 'bad'; message: string }
  | { kind: 'notfound' }
  | { kind: 'busy' };

type Decision = 'append' | 'retry' | 'done' | 'conflict';

export const applyTap = async (
  postId: string,
  userId: string,
  req: unknown,
  now: number
): Promise<TapOutcome> => {
  const p = await puzzleForPost(postId);
  if (!p) return { kind: 'notfound' };
  if (!isRecord(req)) return { kind: 'bad', message: 'body must be an object' };
  const { orbit, index } = req;
  const { B, O } = recipeBoard(`${p.layout}:${p.group}`);
  if (!isInt(orbit) || orbit < 0 || orbit >= O.orbs.length) return { kind: 'bad', message: 'bad orbit' };
  if (!isInt(index) || index < 0) return { kind: 'bad', message: 'bad index' };
  const start = parseStart(p.start);

  const st: { d: Decision } = { d: 'append' };
  const { before, after, committed } = await updateProgress(p.day, userId, (cur) => {
    const taps = cur?.taps ?? [];
    if (index < taps.length) {
      st.d = 'retry';
      return null;
    }
    if (cur?.done) {
      st.d = 'done';
      return null;
    }
    if (index > taps.length) {
      st.d = 'conflict';
      return null;
    }
    st.d = 'append';
    const next = [...taps, orbit];
    return { taps: next, hints: cur?.hints ?? 0, done: replay(B, O, start, next).loops === 1 };
  });

  const d = st.d;
  if (d === 'done') return { kind: 'done' };
  if (d === 'conflict') return { kind: 'conflict', taps: before?.taps ?? [] };

  const entry: Progress | null = d === 'retry' ? before : after;
  if (d === 'append' && (!committed || !after)) return { kind: 'busy' };
  if (!entry) return { kind: 'busy' };

  let r: ReturnType<typeof replay>;
  try {
    r = replay(B, O, start, entry.taps);
  } catch {
    return { kind: 'bad', message: 'stored taps are invalid' };
  }

  let streak: Streak | null = null;
  if (d === 'append') {
    // First tap of the day (a hint taken earlier may already have created the entry).
    if ((before?.taps.length ?? 0) === 0) await incrStats(p.day, { players: 1 });
    if (entry.done && !before?.done) {
      await incrStats(p.day, { solved: 1, [`over:${overBucket(entry.taps.length, p.par)}`]: 1 });
      if (p.day === dayNumber(now)) {
        streak = nextStreak(await getStreak(userId), p.day);
        await setStreak(userId, streak);
      }
    }
  }

  const body: TapResponse = { status: 'ok', loops: r.loops, taps: entry.taps.length, done: entry.done };
  if (entry.done) {
    if (d === 'retry') streak = p.day === dayNumber(now) ? await getStreak(userId) : null;
    const result = buildResult(entry, p, streak, await getStats(p.day));
    body.result = result;
  }
  return { kind: 'ok', body };
};

export type HintOutcome =
  | { kind: 'ok'; orbit: number; hints: number }
  | { kind: 'done' }
  | { kind: 'notfound' }
  | { kind: 'unavailable' };

const HINT_BUDGET_MS = 8000;

/** One orbit from a shortest solution from the player's current state (design §3.5). */
export const hint = async (postId: string, userId: string, _now: number): Promise<HintOutcome> => {
  const p = await puzzleForPost(postId);
  if (!p) return { kind: 'notfound' };
  const progress = await getProgress(p.day, userId);
  if (progress?.done) return { kind: 'done' };
  const { B, O } = recipeBoard(`${p.layout}:${p.group}`);
  const taps = progress?.taps ?? [];
  let current: Uint8Array;
  try {
    current = replay(B, O, parseStart(p.start), taps).woven;
  } catch {
    return { kind: 'unavailable' };
  }
  // Undoing every orbit tapped an odd number of times returns to the start, and par more taps solve it,
  // so a solution exists within par + oddCount.
  const counts = new Map<number, number>();
  for (const o of taps) counts.set(o, (counts.get(o) ?? 0) + 1);
  const oddCount = [...counts.values()].filter((n) => n % 2 === 1).length;
  const maxD = Math.min(O.orbs.length, p.par + oddCount);
  const t0 = performance.now();
  const r = solve(B, O, current, maxD);
  if (!r || performance.now() - t0 > HINT_BUDGET_MS) return { kind: 'unavailable' };
  const orbit = r.sol[0];
  if (orbit === undefined) return { kind: 'done' };
  const { after, committed } = await updateProgress(p.day, userId, (cur) => {
    if (cur?.done) return null;
    return { taps: cur?.taps ?? [], hints: (cur?.hints ?? 0) + 1, done: false };
  });
  if (!committed || !after) return { kind: 'unavailable' };
  return { kind: 'ok', orbit, hints: after.hints };
};
