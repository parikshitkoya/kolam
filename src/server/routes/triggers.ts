import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { ensureToday } from '../services/daily';
import { redditPoster } from '../services/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const r = await ensureToday({ now: Date.now, poster: redditPoster });
    return c.json<TriggerResponse>(
      { status: 'success', message: `Kolam No. ${r.day}: posted ${r.posted}` },
      200
    );
  } catch (e) {
    console.error('on-app-install failed', e);
    return c.json<TriggerResponse>({ status: 'error', message: 'Daily job failed' }, 400);
  }
});
