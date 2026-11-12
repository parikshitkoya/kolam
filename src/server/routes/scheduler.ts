import { Hono } from 'hono';
import { ensureToday } from '../services/daily';
import { redditPoster } from '../services/post';

export const scheduler = new Hono();

scheduler.post('/daily-post', async (c) => {
  try {
    const r = await ensureToday({ now: Date.now, poster: redditPoster });
    console.log(`daily-post: day ${r.day}, posted ${r.posted}, generated [${r.generated.join(', ')}]`);
  } catch (e) {
    console.error('daily-post failed', e);
  }
  return c.json({ status: 'ok' }, 200);
});
