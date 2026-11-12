import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { ensureToday, type EnsureResult } from '../services/daily';
import { redditPoster } from '../services/post';

export const menu = new Hono();

const SUMMARY: Record<EnsureResult['status'], (day: number) => string> = {
  posted: (d) => `Posted No. ${d}`,
  exists: (d) => `Already posted No. ${d}`,
  busy: (d) => `Another run is posting No. ${d}, try again in a minute`,
  failed: (d) => `Couldn't post No. ${d}, see the app logs`,
  noPuzzle: (d) => `Couldn't post No. ${d}: no puzzle was generated, see the app logs`,
};

export const toastFor = (r: EnsureResult): string =>
  SUMMARY[r.status](r.day) +
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
