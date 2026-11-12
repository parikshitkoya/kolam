import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { telemetryRoutes } from './telemetry';

const test = createDevvitTest();

const post = (path: string, body: unknown) =>
  telemetryRoutes.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('progress without journeyId is 400 with the invalid receipt', async () => {
  const res = await post('/journey/progress', { progress: 0.5 });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: 'journeyId is required.',
    receipt: { status: 'JOURNEY_RECEIPT_INVALID', message: 'Invalid: Event payload was not recorded.' },
  });
});

test('progress out of range and interaction without action are 400', async () => {
  expect((await post('/journey/progress', { journeyId: 'j', progress: 2 })).status).toBe(400);
  expect((await post('/journey/interaction', { journeyId: 'j' })).status).toBe(400);
  expect((await post('/journey/end', { journeyId: 'j', game: { win: 'yes' } })).status).toBe(400);
});

test('start then a valid end is 200', async () => {
  const start = await post('/journey/start', {});
  expect(start.status).toBe(200);
  const body: unknown = await start.json();
  const journeyId = typeof body === 'object' && body !== null && 'journeyId' in body ? body.journeyId : '';
  expect(typeof journeyId).toBe('string');
  const end = await post('/journey/end', { journeyId, complete: true, game: { win: true, score: 80 } });
  expect(end.status).toBe(200);
  expect((await post('/journey/app-ready', {})).status).toBe(200);
});
