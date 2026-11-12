// fetch wrappers for /api/state and /api/tap. Responses are validated, never cast.
import {
  isInt,
  isIntArray,
  isRecord,
  isStart,
  parseProgress,
  parseStats,
  parseStreak,
  type Result,
  type StateResponse,
  type TapRequest,
  type TapResponse,
} from '../../shared/api';
import { isGroup } from '../../shared/kolam/core';
import type { SendResult } from './tapQueue';

const parseNullable = <T>(x: unknown, parse: (v: unknown) => T | null): T | null | undefined => {
  if (x === null) return null;
  const v = parse(x);
  return v === null ? undefined : v;
};

export const parseStateResponse = (x: unknown): StateResponse | null => {
  if (!isRecord(x) || x.status !== 'ok') return null;
  const { day, date, puzzle, par, loggedIn } = x;
  if (!isInt(day) || typeof date !== 'string' || !isInt(par) || typeof loggedIn !== 'boolean') return null;
  if (!isRecord(puzzle)) return null;
  const { rows, group, start } = puzzle;
  if (!isIntArray(rows) || rows.length === 0 || !isGroup(group) || !isStart(start)) return null;
  const progress = parseNullable(x.progress ?? null, parseProgress);
  const streak = parseNullable(x.streak ?? null, parseStreak);
  if (progress === undefined || streak === undefined) return null;
  const out: StateResponse = {
    status: 'ok',
    day,
    date,
    puzzle: { rows, group, start },
    par,
    loggedIn,
    progress,
    streak,
    subscribed: x.subscribed === true,
    commented: x.commented === true,
    username: typeof x.username === 'string' ? x.username : null,
  };
  if (x.stats !== undefined) {
    const stats = parseStats(x.stats);
    if (stats) out.stats = stats;
  }
  if (x.result !== undefined) {
    const result = parseResult(x.result);
    if (result) out.result = result;
  }
  return out;
};

const parseResult = (x: unknown): Result | null => {
  if (!isRecord(x)) return null;
  const { trail, taps, par, hints } = x;
  if (!isIntArray(trail) || !isInt(taps) || !isInt(par) || !isInt(hints)) return null;
  const streak = parseNullable(x.streak ?? null, parseStreak);
  const stats = parseStats(x.stats);
  if (streak === undefined || !stats) return null;
  return { trail, taps, par, hints, streak, stats };
};

export const parseTapResponse = (x: unknown): TapResponse | null => {
  if (!isRecord(x) || x.status !== 'ok') return null;
  const { loops, taps, done } = x;
  if (!isInt(loops) || !isInt(taps) || typeof done !== 'boolean') return null;
  const out: TapResponse = { status: 'ok', loops, taps, done };
  if (x.result !== undefined) {
    const result = parseResult(x.result);
    if (!result) return null;
    out.result = result;
  }
  return out;
};

const readJson = async (res: Response): Promise<unknown> => {
  try {
    const v: unknown = await res.json();
    return v;
  } catch {
    return undefined;
  }
};

export type FetchStateResult = { ok: true; state: StateResponse } | { ok: false; status: number };

/** status 0 means the request never got an answer. */
export const fetchState = async (): Promise<FetchStateResult> => {
  let res: Response;
  try {
    res = await fetch('/api/state');
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const state = parseStateResponse(await readJson(res));
  return state ? { ok: true, state } : { ok: false, status: 502 };
};

export const sendTap = async (req: TapRequest): Promise<SendResult> => {
  let res: Response;
  try {
    res = await fetch('/api/tap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    return { ok: false, status: 0 };
  }
  const json = await readJson(res);
  if (res.ok) {
    const body = parseTapResponse(json);
    return body ? { ok: true, body } : { ok: false, status: 502 };
  }
  const out: SendResult = { ok: false, status: res.status };
  if (isRecord(json)) {
    if (isIntArray(json.taps)) out.taps = json.taps;
    if (typeof json.message === 'string') out.message = json.message;
  }
  return out;
};
