// Generates puzzles in day order, exactly like the daily job (same salt, history and prevLayout),
// off the main thread so slow Saturday boards don't freeze the page.
import { makeDaily, type Daily, type LayoutId } from '../../src/server/kolam/daily';
import { weekdayOf } from '../../src/shared/day';

export type ToWorker = { upTo: number };
export type FromWorker = { type: 'day'; daily: Daily; ms: number } | { type: 'error'; day: number; message: string };

const made: Daily[] = [];
const used = new Set<string>();
let prevLayout: LayoutId | null = null;
let target = 0;
let running = false;
let failed = false;

const send = (m: FromWorker) => postMessage(m, {});

const step = () => {
  if (made.length >= target || failed) {
    running = false;
    return;
  }
  const day = made.length + 1;
  const t0 = performance.now();
  try {
    const daily = makeDaily({ day, weekday: weekdayOf(day), prevLayout, isUsed: (s) => used.has(s), salt: 'kolam-v1' });
    made.push(daily);
    used.add(daily.sig);
    prevLayout = daily.layout;
    send({ type: 'day', daily, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    failed = true;
    send({ type: 'error', day, message: e instanceof Error ? e.message : String(e) });
  }
  setTimeout(step, 0);
};

addEventListener('message', (e: MessageEvent<unknown>) => {
  const d = e.data;
  if (typeof d === 'object' && d !== null && 'upTo' in d && typeof d.upTo === 'number') {
    target = Math.max(target, d.upTo);
    if (!running) {
      running = true;
      step();
    }
  }
});
