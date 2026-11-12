import { expect, test } from 'vitest';
import type { TapRequest, TapResponse } from '../../shared/api';
import { TapQueue, type SendResult } from './tapQueue';

const okBody = (taps: number): TapResponse => ({ status: 'ok', loops: 3, taps, done: false });

type Harness = {
  q: TapQueue;
  sent: TapRequest[];
  log: string[];
  sleeps: number[];
  idle: boolean[];
  inFlightMax: () => number;
  settle: () => Promise<void>;
};

const harness = (script: (r: TapRequest, n: number) => SendResult | Promise<SendResult>): Harness => {
  const sent: TapRequest[] = [];
  const log: string[] = [];
  const sleeps: number[] = [];
  const idle: boolean[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let pending = Promise.resolve();
  const q = new TapQueue({
    send: async (r) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      sent.push(r);
      await Promise.resolve();
      const res = await script(r, sent.length);
      inFlight--;
      return res;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onConflict: (taps) => log.push('conflict:' + taps.join(',')),
    onDone: () => log.push('done'),
    onResult: (r) => log.push('result:' + r.taps),
    onIdleChange: (i) => {
      idle.push(i);
      if (i) resolveIdle();
    },
  });
  let resolveIdle = () => {};
  pending = new Promise<void>((res) => {
    resolveIdle = res;
  });
  return {
    q,
    sent,
    log,
    sleeps,
    idle,
    inFlightMax: () => maxInFlight,
    settle: () => pending,
  };
};

test('sends in order, one at a time', async () => {
  const h = harness((r) => ({ ok: true, body: okBody(r.index + 1) }));
  h.q.push({ orbit: 4, index: 0 });
  h.q.push({ orbit: 5, index: 1 });
  h.q.push({ orbit: 6, index: 2 });
  await h.settle();
  expect(h.sent.map((r) => r.index)).toEqual([0, 1, 2]);
  expect(h.inFlightMax()).toBe(1);
  expect(h.log).toEqual(['result:1', 'result:2', 'result:3']);
});

test('a 503 then 200 retries the same request with backoff', async () => {
  const h = harness((r, n) => (n === 1 ? { ok: false, status: 503 } : { ok: true, body: okBody(r.index + 1) }));
  h.q.push({ orbit: 2, index: 0 });
  await h.settle();
  expect(h.sent).toEqual([{ orbit: 2, index: 0 }, { orbit: 2, index: 0 }]);
  expect(h.sleeps).toEqual([1000]);
});

test('network errors back off 1, 2, 4, 8, 16, 30, 30 s', async () => {
  const h = harness((r, n) => {
    if (n <= 7) throw new Error('offline');
    return { ok: true, body: okBody(r.index + 1) };
  });
  h.q.push({ orbit: 1, index: 0 });
  await h.settle();
  expect(h.sleeps).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

test('409 clears the queue and reports the server taps', async () => {
  const h = harness(() => ({ ok: false, status: 409, taps: [4] }));
  h.q.push({ orbit: 1, index: 1 });
  h.q.push({ orbit: 2, index: 2 });
  await h.settle();
  expect(h.sent.length).toBe(1);
  expect(h.log).toEqual(['conflict:4']);
});

test('400 done clears and calls onDone; other 4xx drops and continues', async () => {
  const h = harness((r) =>
    r.index === 0 ? { ok: false, status: 400, message: 'bad orbit' } : { ok: false, status: 400, message: 'done' }
  );
  h.q.push({ orbit: 1, index: 0 });
  h.q.push({ orbit: 2, index: 1 });
  h.q.push({ orbit: 3, index: 2 });
  await h.settle();
  expect(h.sent.map((r) => r.index)).toEqual([0, 1]);
  expect(h.log).toEqual(['done']);
});

test('onIdleChange toggles busy then idle', async () => {
  const h = harness((r) => ({ ok: true, body: okBody(r.index + 1) }));
  h.q.push({ orbit: 1, index: 0 });
  h.q.push({ orbit: 1, index: 1 });
  await h.settle();
  expect(h.idle).toEqual([false, true]);
});
