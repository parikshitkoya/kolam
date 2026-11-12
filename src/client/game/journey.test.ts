import { expect, test } from 'vitest';
import { createJourney, type JourneyTelemetry } from './journey';

type Call = [string, unknown?];
const fake = (opts: { reject?: string } = {}) => {
  const calls: Call[] = [];
  const rec =
    (name: string) =>
    async (arg?: unknown) => {
      calls.push(arg === undefined ? [name] : [name, arg]);
      if (opts.reject === name) throw new Error('telemetry down');
      return { journeyId: 'j1', receipt: { status: 'JOURNEY_RECEIPT_VALID' as const, message: '' } };
    };
  const t: JourneyTelemetry = {
    appReady: rec('appReady'),
    startJourney: rec('startJourney'),
    progress: rec('progress'),
    interaction: rec('interaction'),
    endJourney: rec('endJourney'),
  };
  return { t, calls };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

test('start once over five taps; progress only on new minimums', async () => {
  const { t, calls } = fake();
  const j = createJourney(t);
  for (const loops of [9, 7, 8, 5, 6]) j.tap(loops, 9);
  await flush();
  expect(calls.filter((c) => c[0] === 'startJourney').length).toBe(1);
  expect(calls.filter((c) => c[0] === 'progress')).toEqual([
    ['progress', { progress: 1 - 6 / 8 }],
    ['progress', { progress: 1 - 4 / 8 }],
  ]);
  expect(calls[0]?.[0]).toBe('startJourney');
});

test('a rejecting client never throws out of the journey', async () => {
  for (const reject of ['startJourney', 'progress', 'endJourney', 'appReady', 'interaction']) {
    const { t } = fake({ reject });
    const j = createJourney(t);
    expect(() => {
      j.ready();
      j.tap(9, 9);
      j.tap(5, 9);
      j.hint();
      j.finish(4, 4);
    }).not.toThrow();
    await flush();
  }
});

test('a throwing (sync) client never throws either', () => {
  const boom = () => {
    throw new Error('express missing');
  };
  const j = createJourney({ appReady: boom, startJourney: boom, progress: boom, interaction: boom, endJourney: boom });
  expect(() => {
    j.ready();
    j.tap(3, 3);
    j.hint();
    j.finish(1, 1);
  }).not.toThrow();
});

test('finish without a start sends nothing; finish twice sends one end', async () => {
  const a = fake();
  createJourney(a.t).finish(4, 4);
  await flush();
  expect(a.calls).toEqual([]);

  const b = fake();
  const j = createJourney(b.t);
  j.tap(5, 5);
  j.finish(6, 4);
  j.finish(6, 4);
  await flush();
  expect(b.calls.filter((c) => c[0] === 'endJourney')).toEqual([
    ['endJourney', { complete: true, game: { win: true, score: 80 } }],
  ]);
});

test('ready once; hint is an interaction; startLoops 1 sends no progress', async () => {
  const { t, calls } = fake();
  const j = createJourney(t);
  j.ready();
  j.ready();
  j.hint();
  j.tap(1, 1);
  await flush();
  expect(calls.filter((c) => c[0] === 'appReady').length).toBe(1);
  expect(calls).toContainEqual(['interaction', { action: 'hint' }]);
  expect(calls.filter((c) => c[0] === 'progress')).toEqual([]);
});
