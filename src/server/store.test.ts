import { expect, vi } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { parsePostData } from '../shared/api';
import {
  getAhead,
  getDayForPost,
  getPostForDay,
  getProgress,
  getPuzzle,
  getStats,
  getSticky,
  getStreak,
  incrStats,
  loadSigs,
  addSig,
  putPuzzleNX,
  setAhead,
  setPostMapping,
  setSticky,
  setStreak,
  tryLock,
  updateProgress,
  type PuzzleRecord,
} from './store';

const test = createDevvitTest();

const P1: PuzzleRecord = {
  day: 1,
  date: '2026-11-23',
  layout: 'sq3',
  group: 'mirror',
  start: '000101011000',
  par: 2,
  sig: 'eae53a1ac831c4cd',
};

test('putPuzzleNX writes once and never overwrites', async () => {
  expect(await getPuzzle(1)).toBeNull();
  expect(await putPuzzleNX(P1)).toBe(true);
  expect(await putPuzzleNX({ ...P1, start: '111111111111', par: 3 })).toBe(false);
  expect(await getPuzzle(1)).toEqual(P1);
});

test('getPuzzle rejects a corrupt record', async () => {
  await redis.set('puzzle:2', '{not json');
  expect(await getPuzzle(2)).toBeNull();
  await redis.set('puzzle:3', JSON.stringify({ ...P1, day: 3, layout: 'nope' }));
  expect(await getPuzzle(3)).toBeNull();
});

test('sigs and ahead', async () => {
  expect((await loadSigs()).size).toBe(0);
  await addSig('abc', 1);
  await addSig('def', 2);
  expect([...(await loadSigs())].sort()).toEqual(['abc', 'def']);
  expect(await getAhead()).toBe(0);
  await setAhead(9);
  expect(await getAhead()).toBe(9);
});

test('setPostMapping round-trips both directions; sticky', async () => {
  expect(await getPostForDay(4)).toBeNull();
  expect(await getDayForPost('t3_x')).toBeNull();
  await setPostMapping(4, 't3_x');
  expect(await getPostForDay(4)).toBe('t3_x');
  expect(await getDayForPost('t3_x')).toBe(4);
  expect(await getSticky('t3_x')).toBeNull();
  await setSticky('t3_x', 't1_y');
  expect(await getSticky('t3_x')).toBe('t1_y');
});

test('tryLock is true then false for the same key', async () => {
  expect(await tryLock('lock:post:1', 60)).toBe(true);
  expect(await tryLock('lock:post:1', 60)).toBe(false);
  expect(await tryLock('lock:post:2', 60)).toBe(true);
});

test('updateProgress appends; null decision writes nothing', async () => {
  const r1 = await updateProgress(1, 't2_a', (cur) => ({ taps: [...(cur?.taps ?? []), 3], hints: 0, done: false }));
  expect(r1).toEqual({ before: null, after: { taps: [3], hints: 0, done: false }, committed: true });
  const r2 = await updateProgress(1, 't2_a', (cur) => ({ taps: [...(cur?.taps ?? []), 5], hints: 0, done: false }));
  expect(r2.before).toEqual({ taps: [3], hints: 0, done: false });
  expect(await getProgress(1, 't2_a')).toEqual({ taps: [3, 5], hints: 0, done: false });
  const r3 = await updateProgress(1, 't2_a', () => null);
  expect(r3).toEqual({ before: { taps: [3, 5], hints: 0, done: false }, after: null, committed: false });
  expect(await getProgress(1, 't2_a')).toEqual({ taps: [3, 5], hints: 0, done: false });
  expect(await getProgress(1, 't2_b')).toBeNull();
});

test('updateProgress retries once when exec aborts, then gives up', async () => {
  // The in-memory mock never aborts a watched transaction, so simulate an aborted EXEC.
  const real = redis.watch.bind(redis);
  let aborts = 1;
  const spy = vi.spyOn(redis, 'watch').mockImplementation(async (...keys: string[]) => {
    const tx = await real(...keys);
    const exec = tx.exec.bind(tx);
    tx.exec = async () => {
      if (aborts > 0) {
        aborts--;
        await tx.discard();
        return [];
      }
      return exec();
    };
    return tx;
  });
  const add = (n: number) => (cur: { taps: number[] } | null) => ({ taps: [...(cur?.taps ?? []), n], hints: 0, done: false });
  const ok = await updateProgress(2, 't2_a', add(1));
  expect(ok.committed).toBe(true);
  expect(await getProgress(2, 't2_a')).toEqual({ taps: [1], hints: 0, done: false });
  aborts = 2;
  const fail = await updateProgress(2, 't2_a', add(2));
  expect(fail.committed).toBe(false);
  expect(await getProgress(2, 't2_a')).toEqual({ taps: [1], hints: 0, done: false });
  spy.mockRestore();
});

test('getStats on an empty day returns zeros', async () => {
  expect(await getStats(9)).toEqual({ players: 0, solved: 0, over: [0, 0, 0, 0, 0, 0] });
  await incrStats(9, { players: 1 });
  await incrStats(9, { players: 1, solved: 1, 'over:2': 1 });
  expect(await getStats(9)).toEqual({ players: 2, solved: 1, over: [0, 0, 1, 0, 0, 0] });
});

test('streak round-trips', async () => {
  expect(await getStreak('t2_a')).toBeNull();
  await setStreak('t2_a', { current: 2, best: 3, lastDay: 5 });
  expect(await getStreak('t2_a')).toEqual({ current: 2, best: 3, lastDay: 5 });
});

test('parsePostData', () => {
  const ok = { v: 1, day: 1, rows: [3, 3, 3], group: 'mirror', start: '000101011000', par: 2 };
  expect(parsePostData(ok)).toEqual(ok);
  expect(parsePostData({ ...ok, v: 2 })).toBeNull();
  expect(parsePostData({ ...ok, group: 'rot3' })).toBeNull();
  expect(parsePostData({ ...ok, rows: ['3', 3, 3] })).toBeNull();
  expect(parsePostData(null)).toBeNull();
  expect(parsePostData('x')).toBeNull();
});
