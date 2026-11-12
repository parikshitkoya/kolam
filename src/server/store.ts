// The only module that touches Redis. Keys exactly as build spec §6.1, plus lock:post:{day}.
import { redis } from '@devvit/web/server';
import {
  isInt,
  isRecord,
  isStart,
  parseProgress,
  parseStreak,
  safeJson,
  type Progress,
  type Stats,
  type Streak,
} from '../shared/api';
import { isGroup, type Group } from '../shared/kolam/core';
import { isLayoutId, type LayoutId } from './kolam/daily';

export type PuzzleRecord = {
  day: number;
  date: string;
  layout: LayoutId;
  group: Group;
  start: string;
  par: number;
  sig: string;
};

const K = {
  puzzle: (day: number) => `puzzle:${day}`,
  sigs: 'puzzle:sigs',
  ahead: 'puzzle:ahead',
  dayPost: 'day:post',
  postDay: 'post:day',
  sticky: 'post:sticky',
  prog: (day: number) => `prog:${day}`,
  stats: (day: number) => `stats:${day}`,
  streak: 'streak',
  sub: 'sub',
  commented: (day: number) => `commented:${day}`,
} as const;

const parsePuzzle = (x: unknown): PuzzleRecord | null => {
  if (!isRecord(x)) return null;
  const { day, date, layout, group, start, par, sig } = x;
  if (!isInt(day) || typeof date !== 'string' || typeof layout !== 'string' || !isLayoutId(layout)) {
    return null;
  }
  if (!isGroup(group) || !isStart(start) || !isInt(par) || typeof sig !== 'string') return null;
  return { day, date, layout, group, start, par, sig };
};

const toInt = (s: string | undefined | null): number | null => {
  if (s === undefined || s === null || !/^-?\d+$/.test(s)) return null;
  return Number(s);
};

// --- puzzles -------------------------------------------------------------------------------

export const getPuzzle = async (day: number): Promise<PuzzleRecord | null> =>
  parsePuzzle(safeJson(await redis.get(K.puzzle(day))));

/** SET NX: a day's puzzle is never rewritten. True if this call wrote it. */
export const putPuzzleNX = async (p: PuzzleRecord): Promise<boolean> =>
  (await redis.set(K.puzzle(p.day), JSON.stringify(p), { nx: true })) === 'OK';

export const loadSigs = async (): Promise<Set<string>> => new Set(await redis.hKeys(K.sigs));

export const addSig = async (sig: string, day: number): Promise<void> => {
  await redis.hSet(K.sigs, { [sig]: String(day) });
};

export const getAhead = async (): Promise<number> => toInt(await redis.get(K.ahead)) ?? 0;

export const setAhead = async (day: number): Promise<void> => {
  await redis.set(K.ahead, String(day));
};

// --- posts ---------------------------------------------------------------------------------

export const getPostForDay = async (day: number): Promise<string | null> =>
  (await redis.hGet(K.dayPost, String(day))) ?? null;

export const getDayForPost = async (postId: string): Promise<number | null> =>
  toInt(await redis.hGet(K.postDay, postId));

export const setPostMapping = async (day: number, postId: string): Promise<void> => {
  // post:day first: a crash in between leaves a post that still plays, and day:post is retried.
  await redis.hSet(K.postDay, { [postId]: String(day) });
  await redis.hSet(K.dayPost, { [String(day)]: postId });
};

export const getSticky = async (postId: string): Promise<string | null> =>
  (await redis.hGet(K.sticky, postId)) ?? null;

export const setSticky = async (postId: string, commentId: string): Promise<void> => {
  await redis.hSet(K.sticky, { [postId]: commentId });
};

export const clearSticky = async (postId: string): Promise<void> => {
  await redis.hDel(K.sticky, [postId]);
};

/** SET NX with expiry. True if this caller took the lock. */
export const tryLock = async (key: string, ttlSec: number): Promise<boolean> =>
  (await redis.set(key, '1', { nx: true, expiration: new Date(Date.now() + ttlSec * 1000) })) ===
  'OK';

export const releaseLock = async (key: string): Promise<void> => {
  await redis.del(key);
};

// --- progress ------------------------------------------------------------------------------

export const getProgress = async (day: number, userId: string): Promise<Progress | null> =>
  parseProgress(safeJson(await redis.hGet(K.prog(day), userId)));

/**
 * Read-decide-write under WATCH. `decide` returns the new entry, or null to write nothing.
 * An aborted EXEC is retried once; after that the result is `committed: false`.
 */
export const updateProgress = async (
  day: number,
  userId: string,
  decide: (cur: Progress | null) => Progress | null
): Promise<{ before: Progress | null; after: Progress | null; committed: boolean }> => {
  const key = K.prog(day);
  let before: Progress | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const tx = await redis.watch(key);
    before = parseProgress(safeJson(await redis.hGet(key, userId)));
    const after = decide(before);
    if (after === null) {
      await tx.unwatch();
      return { before, after: null, committed: false };
    }
    await tx.multi();
    await tx.hSet(key, { [userId]: JSON.stringify(after) });
    let res: unknown[] | null = null;
    try {
      res = await tx.exec();
    } catch (e) {
      console.warn(`updateProgress exec failed for ${key}`, e);
    }
    if (Array.isArray(res) && res.length > 0) return { before, after, committed: true };
  }
  return { before, after: null, committed: false };
};

// --- stats and streaks ---------------------------------------------------------------------

export const incrStats = async (day: number, fields: Record<string, number>): Promise<void> => {
  for (const [f, n] of Object.entries(fields)) await redis.hIncrBy(K.stats(day), f, n);
};

export const getStats = async (day: number): Promise<Stats> => {
  const h = await redis.hGetAll(K.stats(day));
  const n = (f: string) => toInt(h[f]) ?? 0;
  return {
    players: n('players'),
    solved: n('solved'),
    over: [0, 1, 2, 3, 4, 5].map((i) => n(`over:${i}`)),
  };
};

export const getStreak = async (userId: string): Promise<Streak | null> =>
  parseStreak(safeJson(await redis.hGet(K.streak, userId)));

export const setStreak = async (userId: string, s: Streak): Promise<void> => {
  await redis.hSet(K.streak, { [userId]: JSON.stringify(s) });
};

// --- social (M2) -----------------------------------------------------------------------------

export const isSubscribed = async (userId: string): Promise<boolean> =>
  (await redis.hGet(K.sub, userId)) === '1';

export const setSubscribed = async (userId: string): Promise<void> => {
  await redis.hSet(K.sub, { [userId]: '1' });
};

export const getCommented = async (day: number, userId: string): Promise<string | null> =>
  (await redis.hGet(K.commented(day), userId)) ?? null;

/** Claim the player's one score comment for the day. True if this call claimed it. */
export const setCommentedNX = async (day: number, userId: string, commentId: string): Promise<boolean> =>
  (await redis.hSetNX(K.commented(day), userId, commentId)) === 1;

export const setCommented = async (day: number, userId: string, commentId: string): Promise<void> => {
  await redis.hSet(K.commented(day), { [userId]: commentId });
};

export const clearCommented = async (day: number, userId: string): Promise<void> => {
  await redis.hDel(K.commented(day), [userId]);
};
