// Request and response types shared by client and server. Manual guards, no casts.
import { isGroup, type Group } from './kolam/core';

/** Stored on every post; frozen from M1. Never contains the solution. */
export type PostData = { v: 1; day: number; rows: number[]; group: Group; start: string; par: number };

export type Progress = { taps: number[]; hints: number; done: boolean };
export type Streak = { current: number; best: number; lastDay: number };
/** `over` has length 6; index 5 means 5 or more over par. */
export type Stats = { players: number; solved: number; over: number[] };

export type Result = {
  trail: number[];
  taps: number;
  par: number;
  hints: number;
  streak: Streak | null;
  stats: Stats;
};

export type StateResponse = {
  status: 'ok';
  day: number;
  date: string;
  puzzle: { rows: number[]; group: Group; start: string };
  par: number;
  loggedIn: boolean;
  progress: Progress | null;
  streak: Streak | null;
  stats?: Stats;
};

export type TapRequest = { orbit: number; index: number };
export type TapResponse = { status: 'ok'; loops: number; taps: number; done: boolean; result?: Result };
export type ErrorResponse = { status: 'error'; message: string; taps?: number[] };

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

export const isIntArray = (x: unknown): x is number[] => Array.isArray(x) && x.every(isInt);

export const isStart = (x: unknown): x is string => typeof x === 'string' && /^[01]+$/.test(x);

export const parsePostData = (x: unknown): PostData | null => {
  if (!isRecord(x)) return null;
  const { v, day, rows, group, start, par } = x;
  if (v !== 1 || !isInt(day) || !isIntArray(rows) || rows.length === 0) return null;
  if (!isGroup(group) || !isStart(start) || !isInt(par)) return null;
  return { v: 1, day, rows, group, start, par };
};

export const parseProgress = (x: unknown): Progress | null => {
  if (!isRecord(x)) return null;
  const { taps, hints, done } = x;
  if (!isIntArray(taps) || !isInt(hints) || typeof done !== 'boolean') return null;
  return { taps, hints, done };
};

export const parseStreak = (x: unknown): Streak | null => {
  if (!isRecord(x)) return null;
  const { current, best, lastDay } = x;
  if (!isInt(current) || !isInt(best) || !isInt(lastDay)) return null;
  return { current, best, lastDay };
};

export const parseStats = (x: unknown): Stats | null => {
  if (!isRecord(x)) return null;
  const { players, solved, over } = x;
  if (!isInt(players) || !isInt(solved) || !isIntArray(over) || over.length !== 6) return null;
  return { players, solved, over };
};

/** JSON.parse that returns undefined instead of throwing. */
export const safeJson = (s: string | null | undefined): unknown => {
  if (s === null || s === undefined) return undefined;
  try {
    const v: unknown = JSON.parse(s);
    return v;
  } catch {
    return undefined;
  }
};
