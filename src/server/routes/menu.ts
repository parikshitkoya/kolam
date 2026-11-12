import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { ensureToday, type EnsureResult } from '../services/daily';
import { redditPoster } from '../services/post';

export const menu = new Hono();

export const toastFor = (r: EnsureResult): string =>
  (r.posted ? `Posted No. ${r.day}` : `Already posted No. ${r.day}`) +
  (r.generated.length > 0 ? `, generated days ${r.generated.join(', ')}` : '');

menu.post('/post-today', async (c) => {
  try {
    const r = await ensureToday({ now: Date.now, poster: redditPoster });
    return c.json<UiResponse>({ showToast: toastFor(r) }, 200);
  } catch (e) {
    console.error('post-today failed', e);
    return c.json<UiResponse>({ showToast: "Couldn't post today's Kolam" }, 200);
  }
});
