// Per-viewer display preferences, guarded like storage.ts (storage may be missing or blocked).
import { useState } from 'react';

const KEY = 'kolam:patterns';

const readPatterns = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const usePatterns = (): [boolean, () => void] => {
  const [on, setOn] = useState(readPatterns);
  const toggle = () =>
    setOn((v) => {
      const next = !v;
      try {
        globalThis.localStorage?.setItem(KEY, next ? '1' : '0');
      } catch {
        // keep it for this session only
      }
      return next;
    });
  return [on, toggle];
};
