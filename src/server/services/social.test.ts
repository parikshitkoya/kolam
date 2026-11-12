import { expect, vi } from 'vitest';
import { redis } from '@devvit/web/server';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { parseStart } from '../../shared/kolam/core';
import { recipeBoard } from '../kolam/daily';
import { solve } from '../kolam/solver';
import { getCommented, getSticky, putPuzzleNX, setCommented, setPostMapping, setSticky } from '../store';
import type { Poster } from './daily';
import { applyTap, getState } from './play';
import { postComment, subscribe, type Commenter } from './social';

const test = createDevvitTest();

const POST = 't3_p1';
const NOW = Date.UTC(2026, 10, 23, 9);
const { B, O } = recipeBoard('sq3:mirror');
const SOL = solve(B, O, parseStart('000101011000'), 5)?.sol ?? [];

const seed = async (opts: { sticky?: boolean } = {}) => {
  await putPuzzleNX({ day: 1, date: '2026-11-23', layout: 'sq3', group: 'mirror', start: '000101011000', par: 2, sig: 'eae53a1ac831c4cd' });
  await setPostMapping(1, POST);
  if (opts.sticky !== false) await setSticky(POST, 't1_sticky');
};
const finish = async (user: string) => {
  for (let i = 0; i < SOL.length; i++) await applyTap(POST, user, { orbit: SOL[i], index: i }, NOW);
};

type Fake = Commenter & { calls: { parent: string; text: string }[]; failNext: Error[] };
const fakeCommenter = (): Fake => {
  const f: Fake = {
    calls: [],
    failNext: [],
    reply: async (parent, text) => {
      await Promise.resolve();
      const err = f.failNext.shift();
      if (err) throw err;
      f.calls.push({ parent, text });
      return `t1_c${f.calls.length}`;
    },
  };
  return f;
};
type FakePoster = Poster & { stickies: string[] };
const fakePoster = (): FakePoster => {
  const f: FakePoster = {
    stickies: [],
    submitPost: async () => 't3_unused',
    submitSticky: async (postId) => {
      f.stickies.push(postId);
      return `t1_new${f.stickies.length}`;
    },
  };
  return f;
};

const TEXT = (trail: number[]) => `Kolam No. 1: ${trail.join(' › ')}  (2 taps, par 2)`;
const trailOf = async () => (await getState(POST, 't2_a', NOW))?.result?.trail ?? [];

test('a plain comment replies to the pinned comment with the exact text', async () => {
  await seed();
  await finish('t2_a');
  const commenter = fakeCommenter();
  const r = await postComment(POST, 't2_a', {}, { commenter, poster: fakePoster() });
  expect(r).toEqual({ kind: 'ok', commentId: 't1_c1' });
  expect(commenter.calls).toEqual([{ parent: 't1_sticky', text: TEXT(await trailOf()) }]);
  expect(await getCommented(1, 't2_a')).toBe('t1_c1');
  expect((await getState(POST, 't2_a', NOW))?.commented).toBe(true);
});

test('a comment with a message is top-level with the message appended', async () => {
  await seed();
  await finish('t2_a');
  const commenter = fakeCommenter();
  await postComment(POST, 't2_a', { message: '  Lovely one  ' }, { commenter, poster: fakePoster() });
  expect(commenter.calls).toEqual([{ parent: POST, text: TEXT(await trailOf()) + '\n\nLovely one' }]);
});

test('two concurrent calls post exactly once', async () => {
  await seed();
  await finish('t2_a');
  const commenter = fakeCommenter();
  const deps = { commenter, poster: fakePoster() };
  const [a, b] = await Promise.all([postComment(POST, 't2_a', {}, deps), postComment(POST, 't2_a', {}, deps)]);
  expect(commenter.calls.length).toBe(1);
  expect([a.kind, b.kind].sort()).toEqual(['already', 'ok']);
});

test('a failed reply releases the claim so a later call succeeds', async () => {
  await seed();
  await finish('t2_a');
  const commenter = fakeCommenter();
  commenter.failNext.push(new Error('rate limited'));
  const deps = { commenter, poster: fakePoster() };
  await expect(postComment(POST, 't2_a', {}, deps)).rejects.toThrow('rate limited');
  expect(await getCommented(1, 't2_a')).toBeNull();
  expect((await postComment(POST, 't2_a', {}, deps)).kind).toBe('ok');
});

test('with no pinned comment stored, one is created and replied to', async () => {
  await seed({ sticky: false });
  await finish('t2_a');
  const commenter = fakeCommenter();
  const poster = fakePoster();
  await postComment(POST, 't2_a', {}, { commenter, poster });
  expect(poster.stickies).toEqual([POST]);
  expect(commenter.calls[0]?.parent).toBe('t1_new1');
  expect(await getSticky(POST)).toBe('t1_new1');
});

test('a deleted pinned comment is recreated and the comment goes to the new one', async () => {
  await seed();
  await finish('t2_a');
  const commenter = fakeCommenter();
  commenter.failNext.push(new Error('NOT_FOUND: comment t1_sticky not found'));
  const poster = fakePoster();
  const r = await postComment(POST, 't2_a', {}, { commenter, poster });
  expect(r.kind).toBe('ok');
  expect(poster.stickies).toEqual([POST]);
  expect(commenter.calls).toEqual([{ parent: 't1_new1', text: TEXT(await trailOf()) }]);
  expect(await getSticky(POST)).toBe('t1_new1');
});

test('not done gives notDone; unknown post gives notfound', async () => {
  await seed();
  const deps = { commenter: fakeCommenter(), poster: fakePoster() };
  expect(await postComment(POST, 't2_a', {}, deps)).toEqual({ kind: 'notDone' });
  expect(await postComment('t3_nope', 't2_a', {}, deps)).toEqual({ kind: 'notfound' });
});

test('subscribe records the flag for getState', async () => {
  await seed();
  let called = 0;
  await subscribe('t2_a', { subscribeToCurrentSubreddit: async () => void called++ });
  expect(called).toBe(1);
  expect((await getState(POST, 't2_a', NOW))?.subscribed).toBe(true);
});

test('a stale pending claim (process died mid-post) is reclaimed; a fresh one still blocks', async () => {
  await seed();
  await finish('t2_a');
  await setCommented(1, 't2_a', `pending:${Date.now() - 5 * 60e3}`);
  expect((await getState(POST, 't2_a', NOW))?.commented).toBe(false);
  const commenter = fakeCommenter();
  const deps = { commenter, poster: fakePoster() };
  expect((await postComment(POST, 't2_a', {}, deps)).kind).toBe('ok');
  expect(commenter.calls.length).toBe(1);

  await setCommented(1, 't2_b', `pending:${Date.now()}`);
  await finish('t2_b');
  expect((await postComment(POST, 't2_b', {}, deps)).kind).toBe('already');
  expect(commenter.calls.length).toBe(1);
});

test('a failed bookkeeping write after a successful reply keeps the claim (no double post)', async () => {
  await seed();
  await finish('t2_a');
  const commenter = fakeCommenter();
  const deps = { commenter, poster: fakePoster() };
  const real = redis.hSet.bind(redis);
  const spy = vi.spyOn(redis, 'hSet').mockImplementation(async (key, fields) => {
    if (key.startsWith('commented:') && Object.values(fields).some((v) => v.startsWith('t1_'))) {
      throw new Error('redis blip');
    }
    return real(key, fields);
  });
  const r = await postComment(POST, 't2_a', {}, deps);
  spy.mockRestore();
  expect(r.kind).toBe('ok');
  expect(await getCommented(1, 't2_a')).not.toBeNull();
  expect((await postComment(POST, 't2_a', {}, deps)).kind).toBe('already');
  expect(commenter.calls.length).toBe(1);
});
