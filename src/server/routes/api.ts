import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { isInt, isRecord, type ErrorResponse, type StateResponse, type TapResponse } from '../../shared/api';
import { applyTap, getState, hint } from '../services/play';
import { redditPoster } from '../services/post';
import { postComment, redditCommenter, subscribe } from '../services/social';

export const api = new Hono();

const NOT_KOLAM: ErrorResponse = { status: 'error', message: 'not a Kolam puzzle' };
const LOGIN: ErrorResponse = { status: 'error', message: 'login required' };

api.get('/state', async (c) => {
  const { postId, userId } = context;
  if (!postId) return c.json<ErrorResponse>(NOT_KOLAM, 404);
  try {
    const state = await getState(postId, userId, Date.now());
    if (!state) return c.json<ErrorResponse>(NOT_KOLAM, 404);
    return c.json<StateResponse>(state, 200);
  } catch (e) {
    console.error('/api/state failed', e);
    return c.json<ErrorResponse>({ status: 'error', message: 'server error' }, 500);
  }
});

api.post('/tap', async (c) => {
  const { postId, userId } = context;
  if (!userId) return c.json<ErrorResponse>(LOGIN, 401);
  if (!postId) return c.json<ErrorResponse>(NOT_KOLAM, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json<ErrorResponse>({ status: 'error', message: 'invalid JSON' }, 400);
  }
  try {
    const out = await applyTap(postId, userId, body, Date.now());
    switch (out.kind) {
      case 'ok':
        return c.json<TapResponse>(out.body, 200);
      case 'conflict':
        return c.json<ErrorResponse>({ status: 'error', message: 'conflict', taps: out.taps }, 409);
      case 'done':
        return c.json<ErrorResponse>({ status: 'error', message: 'done' }, 400);
      case 'bad':
        return c.json<ErrorResponse>({ status: 'error', message: out.message }, 400);
      case 'notfound':
        return c.json<ErrorResponse>(NOT_KOLAM, 404);
      case 'busy':
        return c.json<ErrorResponse>({ status: 'error', message: 'busy' }, 503);
    }
  } catch (e) {
    console.error('/api/tap failed', e);
    return c.json<ErrorResponse>({ status: 'error', message: 'server error' }, 500);
  }
});


const bodyOrEmpty = async (req: { json: () => Promise<unknown> }): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

api.post('/comment', async (c) => {
  const { postId, userId } = context;
  if (!userId) return c.json<ErrorResponse>(LOGIN, 401);
  if (!postId) return c.json<ErrorResponse>(NOT_KOLAM, 404);
  try {
    const out = await postComment(postId, userId, await bodyOrEmpty(c.req), {
      commenter: redditCommenter,
      poster: redditPoster,
    });
    switch (out.kind) {
      case 'ok':
        return c.json({ status: 'ok', commentId: out.commentId }, 200);
      case 'already':
        return c.json<ErrorResponse>({ status: 'error', message: 'already' }, 409);
      case 'notDone':
        return c.json<ErrorResponse>({ status: 'error', message: 'notDone' }, 400);
      case 'notfound':
        return c.json<ErrorResponse>(NOT_KOLAM, 404);
    }
  } catch (e) {
    console.error('/api/comment failed', e);
    return c.json<ErrorResponse>({ status: 'error', message: 'reddit error' }, 502);
  }
});

api.post('/subscribe', async (c) => {
  const { userId } = context;
  if (!userId) return c.json<ErrorResponse>(LOGIN, 401);
  try {
    await subscribe(userId, { subscribeToCurrentSubreddit: () => reddit.subscribeToCurrentSubreddit() });
    return c.json({ status: 'ok' }, 200);
  } catch (e) {
    console.error('/api/subscribe failed', e);
    return c.json<ErrorResponse>({ status: 'error', message: 'reddit error' }, 502);
  }
});

api.post('/hint', async (c) => {
  const { postId, userId } = context;
  if (!userId) return c.json<ErrorResponse>(LOGIN, 401);
  if (!postId) return c.json<ErrorResponse>(NOT_KOLAM, 404);
  try {
    const body = await bodyOrEmpty(c.req);
    const index = isRecord(body) && isInt(body.index) ? body.index : undefined;
    const out = await hint(postId, userId, Date.now(), index);
    switch (out.kind) {
      case 'ok':
        return c.json({ status: 'ok', orbit: out.orbit, hints: out.hints }, 200);
      case 'done':
        return c.json<ErrorResponse>({ status: 'error', message: 'done' }, 400);
      case 'notfound':
        return c.json<ErrorResponse>(NOT_KOLAM, 404);
      case 'unavailable':
        return c.json<ErrorResponse>({ status: 'error', message: 'unavailable' }, 503);
      case 'stale':
        return c.json<ErrorResponse>({ status: 'error', message: 'stale' }, 409);
    }
  } catch (e) {
    console.error('/api/hint failed', e);
    return c.json<ErrorResponse>({ status: 'error', message: 'unavailable' }, 503);
  }
});
