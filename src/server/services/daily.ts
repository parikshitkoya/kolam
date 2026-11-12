// ensureToday: buffer top-up and today's post (design §3.1). Called by the scheduler, the install
// trigger and the moderator menu. Idempotent.
import type { PostData } from '../../shared/api';
import { dateOf, dayNumber, weekdayOf } from '../../shared/day';
import { LAYOUTS, makeDaily, type LayoutId } from '../kolam/daily';
import {
  addSig,
  getAhead,
  getPostForDay,
  getPuzzle,
  getSticky,
  loadSigs,
  putPuzzleNX,
  releaseLock,
  setAhead,
  setPostMapping,
  setSticky,
  tryLock,
  type PuzzleRecord,
} from '../store';

export type Poster = {
  submitPost(p: PuzzleRecord, data: PostData): Promise<string>;
  submitSticky(postId: string): Promise<string>;
};

export type EnsureResult = { day: number; posted: boolean; generated: number[] };

const BUFFER_DAYS = 7;
const MAX_PER_RUN = 2;

export const postDataFor = (p: PuzzleRecord): PostData => ({
  v: 1,
  day: p.day,
  rows: LAYOUTS[p.layout],
  group: p.group,
  start: p.start,
  par: p.par,
});

const topUp = async (today: number, budgetMs: number): Promise<number[]> => {
  const t0 = performance.now();
  const generated: number[] = [];
  let ahead = await getAhead();
  if (ahead < today - 1) ahead = today - 1; // no backfill of days before install
  const sigs = await loadSigs();
  while (ahead < today + BUFFER_DAYS && generated.length < MAX_PER_RUN) {
    if (performance.now() - t0 >= budgetMs) break;
    const d = ahead + 1;
    const prev = await getPuzzle(d - 1);
    const prevLayout: LayoutId | null = prev ? prev.layout : null;
    let rec: PuzzleRecord;
    try {
      const daily = makeDaily({
        day: d,
        weekday: weekdayOf(d),
        prevLayout,
        isUsed: (sig) => sigs.has(sig),
        salt: 'kolam-v1',
      });
      rec = {
        day: d,
        date: dateOf(d),
        layout: daily.layout,
        group: daily.group,
        start: daily.start,
        par: daily.par,
        sig: daily.sig,
      };
    } catch (e) {
      console.error(`ensureToday: makeDaily failed for day ${d}`, e);
      break;
    }
    if (await putPuzzleNX(rec)) {
      await addSig(rec.sig, d);
      sigs.add(rec.sig);
      generated.push(d);
    } else {
      // Another run stored this day first; its record stands. Keep its signature in view.
      const other = await getPuzzle(d);
      if (other) sigs.add(other.sig);
    }
    await setAhead(d);
    ahead = d;
  }
  return generated;
};

export const ensureToday = async (deps: {
  now: () => number;
  poster: Poster;
  budgetMs?: number;
}): Promise<EnsureResult> => {
  const today = Math.max(1, dayNumber(deps.now()));
  const generated = await topUp(today, deps.budgetMs ?? 5000);
  const puzzle = await getPuzzle(today);
  if (!puzzle) {
    console.error(`ensureToday: no puzzle for day ${today}`);
    return { day: today, posted: false, generated };
  }

  let posted = false;
  const existing = await getPostForDay(today);
  if (existing && (await getSticky(existing))) return { day: today, posted, generated };

  const lockKey = `lock:post:${today}`;
  if (!(await tryLock(lockKey, 60))) return { day: today, posted, generated };
  try {
    let postId = await getPostForDay(today);
    if (!postId) {
      postId = await deps.poster.submitPost(puzzle, postDataFor(puzzle));
      await setPostMapping(today, postId);
      posted = true;
      console.log(`ensureToday: posted day ${today} as ${postId}`);
    }
    if (!(await getSticky(postId))) {
      try {
        const commentId = await deps.poster.submitSticky(postId);
        await setSticky(postId, commentId);
      } catch (e) {
        console.error(`ensureToday: results comment failed for ${postId}`, e);
      }
    }
  } catch (e) {
    console.error(`ensureToday: posting day ${today} failed`, e);
  } finally {
    await releaseLock(lockKey);
  }
  return { day: today, posted, generated };
};
