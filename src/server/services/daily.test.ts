import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import type { PostData } from '../../shared/api';
import { getAhead, getDayForPost, getPostForDay, getPuzzle, getSticky, loadSigs, putPuzzleNX, type PuzzleRecord } from '../store';
import { toastFor } from '../routes/menu';
import { ensureToday, type Poster } from './daily';

const test = createDevvitTest();

type FakePoster = Poster & { posts: { p: PuzzleRecord; data: PostData }[]; stickies: string[]; failSticky: number };

const fakePoster = (): FakePoster => {
  let n = 0;
  const f: FakePoster = {
    posts: [],
    stickies: [],
    failSticky: 0,
    submitPost: async (p, data) => {
      f.posts.push({ p, data });
      n++;
      return `t3_${n}`;
    },
    submitSticky: async (postId) => {
      if (f.failSticky > 0) {
        f.failSticky--;
        throw new Error('comment failed');
      }
      f.stickies.push(postId);
      return `t1_${f.stickies.length}`;
    },
  };
  return f;
};

const at = (y: number, m: number, d: number, h = 0) => () => Date.UTC(y, m, d, h);

test('first run on 23 Nov posts day 1 and generates days 1 and 2; second run posts nothing', async () => {
  const poster = fakePoster();
  const r1 = await ensureToday({ now: at(2026, 10, 23, 1), poster });
  expect(r1).toEqual({ day: 1, posted: true, status: 'posted', generated: [1, 2] });
  expect(poster.posts.length).toBe(1);
  const post = poster.posts[0];
  expect(post?.data).toEqual({ v: 1, day: 1, rows: [3, 3, 3], group: 'mirror', start: '000101011000', par: 2 });
  expect(JSON.stringify(post?.data).length).toBeLessThan(2048);
  expect(await getPostForDay(1)).toBe('t3_1');
  expect(await getDayForPost('t3_1')).toBe(1);
  expect(await getSticky('t3_1')).toBe('t1_1');
  const p1 = await getPuzzle(1);
  expect(p1?.date).toBe('2026-11-23');

  const r2 = await ensureToday({ now: at(2026, 10, 23, 1), poster });
  expect(r2.posted).toBe(false);
  expect(poster.posts.length).toBe(1);
  expect(poster.stickies.length).toBe(1);
  expect(await getPuzzle(1)).toEqual(p1);
});

test('pre-launch install posts No. 1 once, nothing new on 23 Nov, day 2 on 24 Nov', async () => {
  const poster = fakePoster();
  expect((await ensureToday({ now: at(2026, 10, 12), poster })).posted).toBe(true);
  expect(poster.posts.map((x) => x.p.day)).toEqual([1]);
  expect((await ensureToday({ now: at(2026, 10, 23, 0), poster })).posted).toBe(false);
  expect((await ensureToday({ now: at(2026, 10, 23, 12), poster })).posted).toBe(false);
  expect(poster.posts.length).toBe(1);
  const r = await ensureToday({ now: at(2026, 10, 24, 0), poster });
  expect(r).toMatchObject({ day: 2, posted: true });
  expect(poster.posts.map((x) => x.p.day)).toEqual([1, 2]);
  expect(await getPostForDay(2)).toBe('t3_2');
});

test('buffer reaches 7 days ahead within 6 runs, each under 10 s', async () => {
  const poster = fakePoster();
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    await ensureToday({ now: at(2026, 10, 23, 1), poster });
    expect(performance.now() - t0).toBeLessThan(10000);
  }
  expect(await getAhead()).toBeGreaterThanOrEqual(8);
  // consecutive days never share a layout; every stored sig is registered
  const sigs = await loadSigs();
  let prev: PuzzleRecord | null = null;
  for (let d = 1; d <= (await getAhead()); d++) {
    const p = await getPuzzle(d);
    expect(p).not.toBeNull();
    if (!p) continue;
    expect(sigs.has(p.sig)).toBe(true);
    if (prev) expect(p.layout).not.toBe(prev.layout);
    prev = p;
  }
});

test('two racing runs create exactly one post', async () => {
  const poster = fakePoster();
  const d = { now: at(2026, 10, 23, 0), poster };
  const [a, b] = await Promise.all([ensureToday(d), ensureToday(d)]);
  expect(poster.posts.length).toBe(1);
  expect([a.posted, b.posted].filter(Boolean).length).toBe(1);
  expect(poster.stickies.length).toBe(1);
});

test('a failed results comment is retried on the next run without reposting', async () => {
  const poster = fakePoster();
  poster.failSticky = 1;
  const r1 = await ensureToday({ now: at(2026, 10, 23, 0), poster });
  expect(r1.posted).toBe(true);
  expect(await getPostForDay(1)).toBe('t3_1');
  expect(await getSticky('t3_1')).toBeNull();
  const r2 = await ensureToday({ now: at(2026, 10, 23, 0), poster });
  expect(r2.posted).toBe(false);
  expect(poster.posts.length).toBe(1);
  expect(poster.stickies).toEqual(['t3_1']);
  expect(await getSticky('t3_1')).toBe('t1_1');
});

test('fresh install mid-run does not backfill earlier days', async () => {
  const poster = fakePoster();
  const r = await ensureToday({ now: at(2026, 11, 2), poster }); // day 10
  expect(r).toEqual({ day: 10, posted: true, status: 'posted', generated: [10, 11] });
  expect(await getPuzzle(9)).toBeNull();
  expect(await redis.get('puzzle:ahead')).toBe('11');
});

test('a failed post reports failed, and the menu toast says so', async () => {
  const poster = fakePoster();
  poster.submitPost = async () => {
    throw new Error('reddit down');
  };
  const r = await ensureToday({ now: at(2026, 10, 23, 1), poster });
  expect(r.status).toBe('failed');
  expect(r.posted).toBe(false);
  expect(toastFor(r)).toMatch(/^Couldn't post No\. 1/);
  expect(await getPostForDay(1)).toBeNull();
});

test('status: posted, then exists; a held lock reports busy', async () => {
  const poster = fakePoster();
  expect((await ensureToday({ now: at(2026, 10, 23, 1), poster })).status).toBe('posted');
  const again = await ensureToday({ now: at(2026, 10, 23, 1), poster });
  expect(again.status).toBe('exists');
  expect(toastFor(again)).toMatch(/^Already posted No\. 1/);
  await redis.set('lock:post:2', '1');
  const busy = await ensureToday({ now: at(2026, 10, 24, 1), poster });
  expect(busy.status).toBe('busy');
  expect(toastFor(busy)).toMatch(/try again/);
});

test('a half-written post mapping is repaired', async () => {
  const poster = fakePoster();
  await ensureToday({ now: at(2026, 10, 23, 1), poster });
  await redis.hDel('post:day', ['t3_1']); // crash between the two mapping writes
  expect(await getDayForPost('t3_1')).toBeNull();
  await ensureToday({ now: at(2026, 10, 23, 2), poster });
  expect(await getDayForPost('t3_1')).toBe(1);
  expect(poster.posts.length).toBe(1);
});

test('a puzzle stored without its signature gets the signature registered', async () => {
  const poster = fakePoster();
  // a run that died after putPuzzleNX and before addSig
  await putPuzzleNX({ day: 1, date: '2026-11-23', layout: 'sq3', group: 'mirror', start: '000101011000', par: 2, sig: 'eae53a1ac831c4cd' });
  await ensureToday({ now: at(2026, 10, 23, 1), poster });
  expect((await loadSigs()).has('eae53a1ac831c4cd')).toBe(true);
});
