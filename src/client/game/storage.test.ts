import { afterEach, expect, test, vi } from 'vitest';
import { clearLocal, loadLocal, saveLocal } from './storage';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test('a valid value round-trips under kolam:prog:{day}', () => {
  const s = memoryStorage();
  vi.stubGlobal('localStorage', s);
  saveLocal(3, { taps: [1, 2], hints: 0, done: false });
  expect(s.raw.has('kolam:prog:3')).toBe(true);
  expect(loadLocal(3)).toEqual({ taps: [1, 2], hints: 0, done: false });
  expect(loadLocal(4)).toBeNull();
});

test('garbage JSON returns null', () => {
  const s = memoryStorage();
  s.raw.set('kolam:prog:5', '{oops');
  s.raw.set('kolam:prog:6', JSON.stringify({ taps: 'x' }));
  vi.stubGlobal('localStorage', s);
  expect(loadLocal(5)).toBeNull();
  expect(loadLocal(6)).toBeNull();
});

test('throwing storage still round-trips through memory', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  });
  saveLocal(7, { taps: [3], hints: 0, done: true });
  expect(loadLocal(7)).toEqual({ taps: [3], hints: 0, done: true });
});

test('missing localStorage still round-trips through memory', () => {
  vi.stubGlobal('localStorage', undefined);
  saveLocal(8, { taps: [0], hints: 0, done: false });
  expect(loadLocal(8)).toEqual({ taps: [0], hints: 0, done: false });
});

test('clearLocal removes the entry, also when removeItem throws', () => {
  const s = memoryStorage();
  vi.stubGlobal('localStorage', s);
  saveLocal(9, { taps: [1], hints: 0, done: true });
  clearLocal(9);
  expect(loadLocal(9)).toBeNull();
  expect(s.raw.has('kolam:prog:9')).toBe(false);
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => {
      throw new Error('SecurityError');
    },
  });
  saveLocal(10, { taps: [2], hints: 0, done: false });
  expect(() => clearLocal(10)).not.toThrow();
  expect(loadLocal(10)).toBeNull();
});
