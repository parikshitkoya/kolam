// Guarded local progress for logged-out players. Storage can be missing, blocked, full or corrupt;
// every access falls back to memory so the game always plays.
import { parseProgress, safeJson, type Progress } from '../../shared/api';

const memory = new Map<string, string>();
const keyFor = (day: number) => `kolam:prog:${day}`;

const read = (key: string): string | null => {
  try {
    const v = globalThis.localStorage?.getItem(key);
    if (typeof v === 'string') return v;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
};

export const loadLocal = (day: number): Progress | null => parseProgress(safeJson(read(keyFor(day))));

export const saveLocal = (day: number, p: Progress): void => {
  const key = keyFor(day);
  const v = JSON.stringify(p);
  memory.set(key, v);
  try {
    globalThis.localStorage?.setItem(key, v);
  } catch {
    // memory copy is enough for this session
  }
};
