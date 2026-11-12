import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { ErrorResponse, StateResponse, TapResponse } from '../../shared/api';
import { applyTap, getState } from '../services/play';

export const api = new Hono();

const NOT_KOLAM: ErrorResponse = { status: 'error', message: 'not a Kolam puzzle' };

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
  if (!userId) return c.json<ErrorResponse>({ status: 'error', message: 'login required' }, 401);
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
