import { expect, describe } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { parseStart } from '../../shared/kolam/core';
import { replay } from '../../shared/kolam/replay';
import { recipeBoard } from '../kolam/daily';
import { solve } from '../kolam/solver';
import {
  getCommented,
  getProgress,
  getStats,
  getStreak,
  isSubscribed,
  putPuzzleNX,
  setCommentedNX,
  setPostMapping,
  setStreak,
  setSubscribed,
} from '../store';
import { applyTap, getState, nextStreak, overBucket } from './play';

const test = createDevvitTest();

const POST = 't3_p1';
const NOW = Date.UTC(2026, 10, 23, 9); // day 1
const LATER = Date.UTC(2026, 10, 25, 9); // day 3

const seed = async () => {
  await putPuzzleNX({ day: 1, date: '2026-11-23', layout: 'sq3', group: 'mirror', start: '000101011000', par: 2, sig: 'eae53a1ac831c4cd' });
  await setPostMapping(1, POST);
};

const { B, O } = recipeBoard('sq3:mirror');
const SOL = solve(B, O, parseStart('000101011000'), 5)?.sol ?? [];
// an orbit that is not the first move of the solution, to play a non-solving first tap
const OTHER = [0, 1, 2, 3, 4, 5, 6].find((o) => !SOL.includes(o)) ?? 0;

const tap = (user: string, orbit: number, index: number, now = NOW) => applyTap(POST, user, { orbit, index }, now);

test('solving returns the result with stats and streak', async () => {
  await seed();
  expect(SOL.length).toBe(2);
  const a = await tap('t2_a', SOL[0] ?? -1, 0);
  expect(a.kind).toBe('ok');
  const b = await tap('t2_a', SOL[1] ?? -1, 1);
  if (b.kind !== 'ok') throw new Error('expected ok, got ' + b.kind);
  expect(b.body.done).toBe(true);
  expect(b.body.loops).toBe(1);
  expect(b.body.taps).toBe(2);
  const r = b.body.result;
  expect(r?.trail).toEqual([5, expect.any(Number), 1]);
  expect(r?.stats.solved).toBe(1);
  expect(r?.stats.over[0]).toBe(1);
  expect(r?.streak).toEqual({ current: 1, best: 1, lastDay: 1 });
  expect(r?.par).toBe(2);
});

test('a resent completing tap gets the result again; stats unchanged; later taps rejected', async () => {
  await seed();
  await tap('t2_a', SOL[0] ?? -1, 0);
  await tap('t2_a', SOL[1] ?? -1, 1);
  const again = await tap('t2_a', SOL[1] ?? -1, 1);
  if (again.kind !== 'ok') throw new Error('expected ok, got ' + again.kind);
  expect(again.body.done).toBe(true);
  expect(again.body.result?.trail.at(-1)).toBe(1);
  expect((await getStats(1)).solved).toBe(1);
  expect((await getStats(1)).players).toBe(1);
  expect((await tap('t2_a', 0, 2)).kind).toBe('done');
});

test('mid-game retry does not append; index ahead is a conflict', async () => {
  await seed();
  await tap('t2_a', OTHER, 0);
  const retry = await tap('t2_a', OTHER, 0);
  expect(retry.kind).toBe('ok');
  expect((await getProgress(1, 't2_a'))?.taps).toEqual([OTHER]);
  expect(await tap('t2_a', 3, 5)).toEqual({ kind: 'conflict', taps: [OTHER] });
  expect((await getStats(1)).players).toBe(1);
});

describe('bad input', () => {
  test.for([
    [{ orbit: -1, index: 0 }],
    [{ orbit: 7, index: 0 }],
    [{ orbit: 1.5, index: 0 }],
    [{ orbit: 1, index: -1 }],
    [{ orbit: 1 }],
    [{ index: 0 }],
    ['nope'],
    [null],
  ])('%j is bad', async ([req]) => {
    await seed();
    expect((await applyTap(POST, 't2_a', req, NOW)).kind).toBe('bad');
  });
});

test('a post with no mapping is notfound', async () => {
  await seed();
  expect(await applyTap('t3_other', 't2_a', { orbit: 0, index: 0 }, NOW)).toEqual({ kind: 'notfound' });
  expect(await getState('t3_other', 't2_a', NOW)).toBeNull();
});

test('getState reports puzzle and progress; stats only when done', async () => {
  await seed();
  const s0 = await getState(POST, undefined, NOW);
  expect(s0).toEqual({
    status: 'ok', day: 1, date: '2026-11-23',
    puzzle: { rows: [3, 3, 3], group: 'mirror', start: '000101011000' },
    par: 2, loggedIn: false, progress: null, streak: null,
    subscribed: false, commented: false, username: null,
  });
  await tap('t2_a', SOL[0] ?? -1, 0);
  const s1 = await getState(POST, 't2_a', NOW);
  expect(s1?.loggedIn).toBe(true);
  expect(s1?.progress?.taps).toEqual([SOL[0]]);
  expect(s1?.stats).toBeUndefined();
  await tap('t2_a', SOL[1] ?? -1, 1);
  const s2 = await getState(POST, 't2_a', NOW);
  expect(s2?.progress?.done).toBe(true);
  expect(s2?.stats?.solved).toBe(1);
  expect(s2?.streak?.current).toBe(1);
});

test('archive solve leaves the streak untouched', async () => {
  await seed();
  await tap('t2_a', SOL[0] ?? -1, 0, LATER);
  const r = await tap('t2_a', SOL[1] ?? -1, 1, LATER);
  if (r.kind !== 'ok') throw new Error('expected ok');
  expect(r.body.done).toBe(true);
  expect(r.body.result?.streak).toBeNull();
  expect(await getStreak('t2_a')).toBeNull();
});

test('players increments once per user', async () => {
  await seed();
  await setStreak('t2_b', { current: 1, best: 1, lastDay: 0 });
  await tap('t2_a', OTHER, 0);
  await tap('t2_a', OTHER, 1);
  await tap('t2_a', OTHER, 1);
  await tap('t2_b', OTHER, 0);
  await tap('t2_b', OTHER, 0);
  expect((await getStats(1)).players).toBe(2);
});

test('nextStreak and overBucket', () => {
  expect(nextStreak(null, 5)).toEqual({ current: 1, best: 1, lastDay: 5 });
  expect(nextStreak({ current: 3, best: 3, lastDay: 4 }, 5)).toEqual({ current: 4, best: 4, lastDay: 5 });
  expect(nextStreak({ current: 4, best: 4, lastDay: 5 }, 5)).toEqual({ current: 4, best: 4, lastDay: 5 });
  expect(nextStreak({ current: 4, best: 6, lastDay: 2 }, 5)).toEqual({ current: 1, best: 6, lastDay: 5 });
  expect(overBucket(2, 2)).toBe(0);
  expect(overBucket(4, 2)).toBe(2);
  expect(overBucket(30, 2)).toBe(5);
  expect(overBucket(1, 2)).toBe(0);
});

test('getState carries the result once solved, with the replayed trail', async () => {
  await seed();
  const before = await getState(POST, 't2_a', NOW);
  expect(before?.result).toBeUndefined();
  expect(before?.commented).toBe(false);
  expect(before?.subscribed).toBe(false);
  await tap('t2_a', SOL[0] ?? -1, 0);
  await tap('t2_a', SOL[1] ?? -1, 1);
  const s = await getState(POST, 't2_a', NOW);
  const expected = replay(B, O, parseStart('000101011000'), SOL).trail;
  expect(s?.result?.trail).toEqual(expected);
  expect(s?.result?.taps).toBe(2);
  expect(s?.result?.par).toBe(2);
  expect(s?.result?.streak).toEqual({ current: 1, best: 1, lastDay: 1 });
  expect(s?.result?.stats.solved).toBe(1);
  expect(s?.commented).toBe(false);
  expect(s?.username).toBe('testuser');
  const anon = await getState(POST, undefined, NOW);
  expect(anon?.username).toBeNull();
});

test('store: subscribed and commented flags', async () => {
  expect(await isSubscribed('t2_a')).toBe(false);
  await setSubscribed('t2_a');
  expect(await isSubscribed('t2_a')).toBe(true);
  expect(await getCommented(1, 't2_a')).toBeNull();
  expect(await setCommentedNX(1, 't2_a', 'pending')).toBe(true);
  expect(await setCommentedNX(1, 't2_a', 'x')).toBe(false);
  expect(await getCommented(1, 't2_a')).toBe('pending');
});
